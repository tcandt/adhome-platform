"""Local-only CCCD semantic-corner heatmaps and document-presence training."""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import hashlib
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageOps
from torch import nn
from torch.nn import functional as F
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


class CornerHeatmapNet(nn.Module):
    def __init__(self, pretrained=True):
        super().__init__()
        self.features = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT if pretrained else None).features
        self.deep = nn.Conv2d(576, 64, 1)
        self.mid = nn.Conv2d(48, 64, 1)
        self.low = nn.Conv2d(24, 64, 1)
        self.fine = nn.Conv2d(16, 64, 1)
        self.heatmap_head = nn.Sequential(nn.Conv2d(64, 64, 3, padding=1), nn.ReLU(), nn.Conv2d(64, 4, 1))
        self.presence_head = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(576, 64), nn.ReLU(), nn.Linear(64, 1))
        self.register_buffer('mean', torch.tensor([.485, .456, .406])[None, :, None, None])
        self.register_buffer('std', torch.tensor([.229, .224, .225])[None, :, None, None])

    def forward(self, image):
        x = (image - self.mean) / self.std
        fine = low = mid = None
        for i, layer in enumerate(self.features):
            x = layer(x)
            if i == 1: fine = x
            if i == 3: low = x
            if i == 8: mid = x
        p = F.interpolate(self.deep(x), size=mid.shape[-2:], mode='bilinear', align_corners=False) + self.mid(mid)
        p = F.interpolate(p, size=low.shape[-2:], mode='bilinear', align_corners=False) + self.low(low)
        p = F.interpolate(p, size=fine.shape[-2:], mode='bilinear', align_corners=False) + self.fine(fine)
        return self.heatmap_head(p), self.presence_head(x)


def read_rgb(path):
    with Image.open(path) as image:
        return np.asarray(ImageOps.exif_transpose(image).convert('RGB'))


def letterbox(image, points, size):
    h, w = image.shape[:2]
    scale = min(size / w, size / h)
    nw, nh = round(w * scale), round(h * scale)
    left, top = (size - nw) // 2, (size - nh) // 2
    output = np.full((size, size, 3), 127, np.uint8)
    output[top:top + nh, left:left + nw] = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_AREA)
    target = None if points is None else (points * [w * scale, h * scale] + [left, top]) / size
    return output, target, (scale, left, top)


def load_samples(manifest):
    rows = json.loads(Path(manifest).read_text(encoding='utf-8'))
    splits = {}
    for row in rows:
        if row.get('sha256') and hashlib.sha256(Path(row['path']).read_bytes()).hexdigest() != row['sha256']:
            raise ValueError(f"Fixture checksum mismatch: {row['id']}")
        previous = splits.setdefault(row['group'], row['split'])
        if previous != row['split']: raise ValueError(f"Group leakage: {row['group']}")
        row['image'] = read_rgb(row['path'])
        row['points'] = None if row['corners'] is None else np.roll(np.asarray(row['corners'], np.float32), -row.get('uprightStart', 0), axis=0)
        if row['points'] is not None:
            h, w = row['image'].shape[:2]
            src = row['points'] * [w, h]
            transform = cv2.getPerspectiveTransform(src.astype(np.float32), np.array([[0,0],[507,0],[507,319],[0,319]], np.float32))
            row['card'] = cv2.warpPerspective(row['image'], transform, (508,320), flags=cv2.INTER_CUBIC)
    return rows


def augment(sample, positives, negatives, size, synthetic=True):
    if sample['positive'] and synthetic and random.random() < .40:
        # Negative paper/passport backgrounds are also hard backgrounds for positive cards.
        if negatives and random.random() < .75:
            background = cv2.resize(random.choice(negatives)['image'], (size,size), interpolation=cv2.INTER_AREA)
        else:
            background = np.random.randint(25,230,(size,size,3),dtype=np.uint8)
            background = cv2.GaussianBlur(background,(0,0),random.uniform(2,12))
            background = np.clip(background.astype(np.int16)+np.random.randint(-70,70,(1,1,3)),0,255).astype(np.uint8)
        chosen = random.choice(positives)
        cw = random.uniform(.3,.92) * size; ch = cw / 1.586
        angle = random.uniform(-math.pi, math.pi)
        base = np.array([[-cw/2,-ch/2],[cw/2,-ch/2],[cw/2,ch/2],[-cw/2,ch/2]],np.float32)
        rotation = np.array([[math.cos(angle),-math.sin(angle)],[math.sin(angle),math.cos(angle)]],np.float32)
        points = base @ rotation.T
        radius = np.max(np.abs(points),axis=0)
        points *= min(1.,(size*.46)/max(radius))
        radius = np.max(np.abs(points),axis=0)
        center = np.array([random.uniform(radius[0]+2,size-radius[0]-2),random.uniform(radius[1]+2,size-radius[1]-2)])
        points += center
        points += np.random.uniform(-min(cw,ch)*.04,min(cw,ch)*.04,(4,2))
        points = np.clip(points,1,size-2).astype(np.float32)
        matrix = cv2.getPerspectiveTransform(np.array([[0,0],[507,0],[507,319],[0,319]],np.float32),points)
        card = cv2.warpPerspective(chosen['card'],matrix,(size,size),flags=cv2.INTER_LINEAR)
        mask = cv2.warpPerspective(np.full((320,508),255,np.uint8),matrix,(size,size)).astype(np.float32)/255
        image = (card*mask[...,None]+background*(1-mask[...,None])).astype(np.uint8)
        points /= size
        present = 1.
    else:
        image, points, _ = letterbox(sample['image'], sample['points'], size)
        present = float(points is not None)
        if synthetic:
            turns = random.randrange(4)
            image = np.rot90(image, turns).copy()
            if points is not None:
                for _ in range(turns): points = np.stack([points[:,1],1-points[:,0]],axis=1)
            angle = random.uniform(-12,12)
            scale = random.uniform(.85,1.05)
            transform = cv2.getRotationMatrix2D((size/2,size/2),angle,scale)
            transform[:,2] += np.random.uniform(-size*.025,size*.025,2)
            image = cv2.warpAffine(image,transform,(size,size),borderValue=(127,127,127))
            if points is not None:
                transformed = np.concatenate([points*size,np.ones((4,1))],axis=1)@transform.T/size
                if np.all((transformed >= 0) & (transformed <= 1)): points = transformed
                else: image,points,_=letterbox(sample['image'],sample['points'],size)
    if synthetic:
        gain = random.uniform(.6,1.3); bias=random.uniform(-15,15)
        image=np.clip(image.astype(np.float32)*gain+bias,0,255).astype(np.uint8)
        if random.random()<.15: image=cv2.GaussianBlur(image,(3,3),random.uniform(.3,1.1))
        if random.random()<.1:
            ok,encoded=cv2.imencode('.jpg',cv2.cvtColor(image,cv2.COLOR_RGB2BGR),[cv2.IMWRITE_JPEG_QUALITY,random.randint(45,90)])
            if ok: image=cv2.cvtColor(cv2.imdecode(encoded,cv2.IMREAD_COLOR),cv2.COLOR_BGR2RGB)
    return image, points, present


def decode(logits):
    result=[]
    for heatmap in logits:
        h,w=heatmap.shape; y,x=np.unravel_index(np.argmax(heatmap),heatmap.shape)
        y0,y1=max(0,y-2),min(h,y+3);x0,x1=max(0,x-2),min(w,x+3)
        local=heatmap[y0:y1,x0:x1]; weights=np.exp(local-local.max()); total=weights.sum()
        px=(weights*(np.arange(x0,x1)[None,:]+.5)).sum()/total/w
        py=(weights*(np.arange(y0,y1)[:,None]+.5)).sum()/total/h
        result.append([px,py])
    return np.array(result,np.float32)


def evaluate(model, rows, size, device):
    model.eval(); results=[]
    with torch.no_grad():
        for row in rows:
            image,target,meta=letterbox(row['image'],row['points'],size)
            tensor=torch.from_numpy(image.transpose(2,0,1).copy()).float().unsqueeze(0).to(device)/255
            heat,presence=model(tensor)
            points=decode(heat[0].cpu().numpy())
            scale,left,top=meta; h,w=row['image'].shape[:2]
            actual=(points*size-[left,top])/[w*scale,h*scale]
            error=None if row['points'] is None else np.linalg.norm(actual-row['points'],axis=1)
            results.append({'id':row['id'],'split':row['split'],'positive':row['points'] is not None,'presence':float(presence.sigmoid().item()),'corners':actual.tolist(),
                'mean':None if error is None else float(error.mean()),'max':None if error is None else float(error.max())})
    return results


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--epochs',type=int,default=48)
    parser.add_argument('--steps',type=int,default=32)
    parser.add_argument('--batch',type=int,default=16)
    parser.add_argument('--size',type=int,default=320)
    parser.add_argument('--all-data',action='store_true')
    parser.add_argument('--resume',type=Path)
    parser.add_argument('--seed',type=int,default=20261109)
    args=parser.parse_args()
    random.seed(args.seed);np.random.seed(args.seed);torch.manual_seed(args.seed);torch.set_num_threads(4);cv2.setNumThreads(1)
    device=torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    rows=load_samples(args.manifest)
    train=rows if args.all_data else [row for row in rows if row['split']=='train']
    positive=[row for row in train if row['positive']];negative=[row for row in train if not row['positive']]
    args.output.mkdir(parents=True,exist_ok=True)
    model=CornerHeatmapNet(pretrained=not bool(args.resume)).to(device)
    if args.resume: model.load_state_dict(torch.load(args.resume,map_location=device,weights_only=True))
    optimizer=torch.optim.AdamW(model.parameters(),lr=3e-4,weight_decay=1e-4)
    scheduler=torch.optim.lr_scheduler.CosineAnnealingLR(optimizer,args.epochs,eta_min=1e-5)
    grid=(torch.arange(args.size//4,device=device)+.5)/(args.size//4)
    gy,gx=torch.meshgrid(grid,grid,indexing='ij')
    best=float('inf');history=[]
    print(json.dumps({'device':str(device),'total':len(rows),'training':len(train),'positive':len(positive),'negative':len(negative),'all_data':args.all_data}),flush=True)
    for epoch in range(args.epochs):
        model.train();total=0.
        for step in range(args.steps):
            images=[];points=[];present=[]
            for j in range(args.batch):
                sample=random.choice(negative if j%5==0 and negative else positive)
                # Negative examples stay negative; never paste a card over their label.
                image,target,yes=augment(sample,positive,negative,args.size,synthetic=True)
                images.append(image.transpose(2,0,1));points.append(np.zeros((4,2),np.float32) if target is None else target);present.append(yes)
            x=torch.from_numpy(np.stack(images).copy()).float().to(device)/255
            target=torch.tensor(np.array(points),device=device,dtype=torch.float32);yes=torch.tensor(present,device=device).float()
            heat,cls=model(x)
            dx=gx[None,None]-target[:,:,0,None,None];dy=gy[None,None]-target[:,:,1,None,None]
            expected=torch.exp(-(dx*dx+dy*dy)/(2*(1.2/(args.size//4))**2))
            expected=expected/(expected.sum((-1,-2),keepdim=True)+1e-12)
            ce=-(expected*F.log_softmax(heat.flatten(2),dim=2).reshape_as(heat)).sum((-1,-2)).mean(1)
            loss=(ce*yes).sum()/yes.sum().clamp(min=1)+F.binary_cross_entropy_with_logits(cls[:,0],yes)*1.5
            optimizer.zero_grad(set_to_none=True);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),5);optimizer.step();total+=float(loss.detach())
        scheduler.step()
        if epoch%4==3 or epoch==args.epochs-1:
            report=evaluate(model,rows,args.size,device)
            validation=[r for r in report if r['split']=='validation']
            evaluated=report if args.all_data else validation
            geom=[r['max'] for r in evaluated if r['positive']]
            classification=sum((r['presence']>=.5)!=r['positive'] for r in evaluated)
            score=float(np.mean(geom))+classification*.1
            entry={'epoch':epoch+1,'loss':total/args.steps,'mean_max_error':float(np.mean(geom)),'worst':float(max(geom)),'classification_errors':classification}
            history.append(entry);print(json.dumps(entry),flush=True)
            torch.save(model.state_dict(),args.output/'latest.pt')
            if score<best:
                best=score;torch.save(model.state_dict(),args.output/'best.pt');(args.output/'evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        (args.output/'history.json').write_text(json.dumps(history,indent=2),encoding='utf-8')
    model.load_state_dict(torch.load(args.output/'best.pt',map_location=device,weights_only=True));model.cpu().eval()
    torch.onnx.export(model,torch.zeros(1,3,args.size,args.size),args.output/'identity-corners-v2.onnx',input_names=['image'],output_names=['heatmaps','presence'],opset_version=18,dynamo=False)
    (args.output/'metadata.json').write_text(json.dumps({'version':2,'inputSize':args.size,'heatmapSize':args.size//4,'cornerOrder':'upright TL TR BR BL','trainingImages':len(train),'allData':args.all_data,'backbone':'torchvision MobileNetV3-Small ImageNet1K','seed':args.seed,'bestScore':best},indent=2),encoding='utf-8')
    print(f'exported={args.output}',flush=True)


if __name__=='__main__': main()
