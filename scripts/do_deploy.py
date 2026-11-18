import subprocess
import os

files_to_copy = [
    ('apps/landing/dist-api/server.mjs', 'adhome-vps101:/home/tcandt/server.new.mjs'),
    ('apps/landing/server/rental-templates/CT01.docx', 'adhome-vps101:/home/tcandt/CT01.docx'),
    ('apps/landing/server/rental-templates/HOP_DONG_1PN.docx', 'adhome-vps101:/home/tcandt/HOP_DONG_1PN.docx'),
    ('apps/landing/server/rental-templates/HOP_DONG_2PN.docx', 'adhome-vps101:/home/tcandt/HOP_DONG_2PN.docx'),
    ('apps/zalo-webhook-api/zalo-bot.cjs', 'adhome-vps101:/home/tcandt/zalo-bot.cjs'),
    ('apps/zalo-webhook-api/registration.cjs', 'adhome-vps101:/home/tcandt/registration.cjs'),
    ('apps/zalo-webhook-api/business-notifications.cjs', 'adhome-vps101:/home/tcandt/business-notifications.cjs'),
    ('scripts/deploy_vps_update.sh', 'adhome-vps101:/home/tcandt/deploy_vps_update.sh'),
]

for src, dst in files_to_copy:
    print(f"Copying {src} -> {dst}...")
    subprocess.check_call(['scp', src, dst])

print("Running deploy script on VPS with sudo...")
p = subprocess.Popen(
    ['ssh', 'adhome-vps101', 'sudo -S bash /home/tcandt/deploy_vps_update.sh'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)
out, err = p.communicate(input=b'@Tinh3033Qq@\n')
print("Deploy returncode:", p.returncode)
print("Deploy STDOUT:", out.decode('utf-8', errors='replace'))
print("Deploy STDERR:", err.decode('utf-8', errors='replace'))
if p.returncode != 0:
    raise RuntimeError("Deploy failed")
print("Deployment completed successfully!")
