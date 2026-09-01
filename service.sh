sudo touch /etc/systemd/system/ngoflow.service
sudo cat > /etc/systemd/system/ngoflow.service
[Unit]
Description=NGOFlow FastAPI Application
After=network.target

[Service]
User=vasudevshreekumar
WorkingDirectory=/home/NGOFlow/ngo
Environment="PATH=/home/NGOFlow/ngo/venv/bin"
ExecStart=/home/NGOFlow/ngo/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ngoflow
sudo systemctl start ngoflow
sudo systemctl status ngoflow