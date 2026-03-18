# Hướng dẫn deploy NestJS + PostgreSQL + Nginx (Full)

## 1. Setup server

sudo apt update && sudo apt upgrade -y sudo apt install git nano curl -y

## 2. Cài Node + PM2

curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash - sudo
apt install nodejs -y sudo npm install -g pm2

## 3. PostgreSQL

sudo apt install postgresql postgresql-contrib -y sudo systemctl start
postgresql

sudo -i -u postgres psql CREATE DATABASE oracle_ics; CREATE USER nam
WITH PASSWORD '123456'; GRANT ALL PRIVILEGES ON DATABASE oracle_ics TO
nam; `\q`{=tex} exit

sudo nano /etc/postgresql/\*/main/pg_hba.conf \# sửa peer -\> md5 sudo
systemctl restart postgresql

## 4. Clone project

git clone https://github.com/trandinhnamuet/oracle-ics-backend.git cd
oracle-ics-backend npm install npm run build

## 5. Upload .oci

scp -r C:`\Users`{=tex}`\Admin`{=tex}.oci root@SERVER_IP:/root/ chmod
600 /root/.oci/\*

## 6. .env

nano .env

DB_HOST=localhost DB_PORT=5432 DB_USERNAME=nam DB_PASSWORD=123456
DB_NAME=oracle_ics

## 7. Run backend

pm2 start dist/main.js --name nest-backend pm2 save

## 8. Nginx

sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

sudo apt install nginx -y

sudo nano /etc/nginx/sites-available/testapi

server { listen 80 default_server; listen \[::\]:80 default_server;
server_name \_; location / { proxy_pass http://127.0.0.1:3003; } }

sudo rm -f /etc/nginx/sites-enabled/\* sudo ln -s
/etc/nginx/sites-available/testapi /etc/nginx/sites-enabled/

sudo systemctl restart nginx

## 9. Test

curl http://localhost

## 10. HTTPS

sudo apt install certbot python3-certbot-nginx -y sudo certbot --nginx
-d testapi.trandinhnamz.xyz
