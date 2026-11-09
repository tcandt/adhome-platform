"""Evaluate the real ONNX export on reviewed annotations, without OCR or network uploads."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
import onnxruntime as ort
import importlib.util

spec=importlib.util.spec_from_file_location('corner_training',Path(__file__).with_name('train-identity-corners-v2.py'))
training=importlib.util.module_from_spec(spec);spec.loader.exec_module(training)


def infer(session,image,size):
    input,_,meta=training.letterbox(image,None,size)
    heat,presence=session.run(None,{'image':input.transpose(2,0,1)[None].astype(np.float32)/255})
    points=training.decode(heat[0]);scale,left,top=meta;h,w=image.shape[:2]
    corners=(points*size-[left,top])/[w*scale,h*scale]
    masses=[]
    for channel in heat[0]:
        weights=np.exp(channel-channel.max());weights/=weights.sum()
        y,x=np.unravel_index(channel.argmax(),channel.shape)
        masses.append(float(weights[max(0,y-2):y+3,max(0,x-2):x+3].sum()))
    score=float(1/(1+np.exp(-presence[0,0])))
    center=corners.mean(0); order=np.argsort(np.arctan2(corners[:,1]-center[1],corners[:,0]-center[0]))
    polygon=corners[order]
    area=abs(np.sum(polygon[:,0]*np.roll(polygon[:,1],-1)-polygon[:,1]*np.roll(polygon[:,0],-1)))/2
    edges=np.linalg.norm(np.roll(polygon,-1,axis=0)-polygon,axis=1)
    valid=area>.015 and min(edges)>.04 and np.all(corners>=-.02) and np.all(corners<=1.02)
    accepted=score>=.9 and min(masses)>=.4 and valid
    return {'corners':corners.tolist(),'presence':score,'cornerMass':masses,'automatic':bool(accepted),'area':float(area)}


def metrics(result,target):
    corners=np.asarray(result['corners'])
    semantic=np.linalg.norm(corners-target,axis=1)
    center=corners.mean(0);order=np.argsort(np.arctan2(corners[:,1]-center[1],corners[:,0]-center[0]));geometric=corners[order]
    all_errors=[np.linalg.norm(np.roll(geometric,shift,axis=0)-target,axis=1) for shift in range(4)]
    errors=min(all_errors,key=lambda x:x.mean())
    return {'mean':float(errors.mean()),'max':float(errors.max()),'semanticMean':float(semantic.mean()),'semanticMax':float(semantic.max()),
            'geometryPass':bool(errors.mean()<.02 and errors.max()<.04),'uprightPass':bool(semantic.mean()<.03 and semantic.max()<.05)}


def padded_source_crop(image,corners):
    h,w=image.shape[:2];width,height=1016,640
    corners=np.clip(corners,[0,0],[w-1,h-1]).astype(np.float32)
    target=np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]],np.float32)
    inverse=cv2.getPerspectiveTransform(target,corners)
    center_denominator=inverse[2]@np.array([(width-1)/2,(height-1)/2,1.])
    def expand(padding):
        points=np.array([[-padding,-padding],[width-1+padding,-padding],[width-1+padding,height-1+padding],[-padding,height-1+padding]],np.float64)
        homogeneous=np.concatenate([points,np.ones((4,1))],axis=1)@inverse.T
        if np.any(homogeneous[:,2]*center_denominator<=1e-12):return None
        return homogeneous[:,:2]/homogeneous[:,2,None]
    low,high=0,max(24,round(min(width,height)*.08))
    while low<high:
        middle=(low+high+1)//2;points=expand(middle)
        if points is not None and np.all(points>=-1e-5) and np.all(points<=[w-1+1e-5,h-1+1e-5]):low=middle
        else:high=middle-1
    sampling=expand(low).astype(np.float32);ow,oh=width+2*low,height+2*low
    transform=cv2.getPerspectiveTransform(sampling,np.array([[0,0],[ow-1,0],[ow-1,oh-1],[0,oh-1]],np.float32))
    return cv2.warpPerspective(image,transform,(ow,oh),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)


def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--model',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--size',type=int,default=320);args=p.parse_args()
    opts=ort.SessionOptions();opts.intra_op_num_threads=4
    session=ort.InferenceSession(str(args.model),sess_options=opts,providers=['CPUExecutionProvider'])
    rows=training.load_samples(args.manifest);report=[];args.output.mkdir(parents=True,exist_ok=True)
    for row in rows:
        result=infer(session,row['image'],args.size)
        result.update({'id':row['id'],'positive':row['positive'],'split':row['split'],'source':row['path']})
        if row['points'] is not None: result.update(metrics(result,row['points']))
        report.append(result)
        image=row['image'].copy();h,w=image.shape[:2]
        if row['points'] is not None: cv2.polylines(image,[np.round(row['points']*[w,h]).astype(np.int32)],True,(30,220,30),max(2,w//400),cv2.LINE_AA)
        corners=np.asarray(result['corners'],np.float32)*[w,h]
        cv2.polylines(image,[np.round(corners).astype(np.int32)],True,(255,20,20),max(2,w//350),cv2.LINE_AA)
        # Semantic keypoint order directly provides upright perspective correction.
        crop=None
        if result['area']>.015:
            crop=padded_source_crop(row['image'],corners)
            cv2.imwrite(str(args.output/f"{row['id']}-flat.jpg"),cv2.cvtColor(crop,cv2.COLOR_RGB2BGR))
        cv2.imwrite(str(args.output/f"{row['id']}-marked.jpg"),cv2.cvtColor(image,cv2.COLOR_RGB2BGR))
        print(json.dumps({k:result.get(k) for k in ['id','automatic','presence','mean','max','uprightPass']},ensure_ascii=True),flush=True)
    def summarize(items):
        pos=[x for x in items if x['positive']];neg=[x for x in items if not x['positive']]
        return {'images':len(items),'positive':len(pos),'negative':len(neg),'meanCornerError':float(np.mean([x['mean'] for x in pos])) if pos else None,
                'geometryPass':sum(x['geometryPass'] for x in pos),'uprightPass':sum(x['uprightPass'] for x in pos),
                'automaticPositive':sum(x['automatic'] for x in pos),'falsePositive':sum(x['automatic'] for x in neg),
                'acceptedWrongGeometry':[x['id'] for x in pos if x['automatic'] and not x['geometryPass']]}
    summary={'all':summarize(report),'holdout':summarize([x for x in report if x['split']=='validation'])}
    (args.output/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(args.output/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print(json.dumps(summary),flush=True)


if __name__=='__main__':main()
