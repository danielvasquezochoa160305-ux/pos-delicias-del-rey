#!/bin/bash
# ============================================================
#  Instalación automática del POS "Delicias del Rey"
#  en un servidor Ubuntu 22.04 / 24.04 (DigitalOcean)
#  Ejecutar como root:   sudo bash deploy/setup.sh
# ============================================================
set -e
APP_DIR=/opt/pos-cafeteria

echo "==> 1/8  Actualizando el sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

echo "==> 2/8  Instalando dependencias (python, nginx, git, sqlite, firewall)..."
apt-get install -y python3 python3-venv python3-pip nginx git sqlite3 ufw

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: no existe $APP_DIR."
  echo "Primero sube el código ahí. Ejemplo:"
  echo "   git clone <URL_DE_TU_REPO> $APP_DIR"
  exit 1
fi
cd "$APP_DIR"

echo "==> 3/8  Creando entorno virtual de Python e instalando librerías..."
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

echo "==> 4/8  Preparando carpetas de datos y permisos..."
mkdir -p "$APP_DIR/public/uploads" "$APP_DIR/backups"
chown -R www-data:www-data "$APP_DIR"

echo "==> 5/8  Instalando servicio (arranque automático)..."
cp deploy/pos-cafeteria.service /etc/systemd/system/pos-cafeteria.service
systemctl daemon-reload
systemctl enable pos-cafeteria
systemctl restart pos-cafeteria

echo "==> 6/8  Configurando Nginx (servidor web)..."
cp deploy/nginx-pos.conf /etc/nginx/sites-available/pos
ln -sf /etc/nginx/sites-available/pos /etc/nginx/sites-enabled/pos
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "==> 7/8  Activando firewall (solo SSH y web)..."
ufw allow OpenSSH
ufw allow 'Nginx HTTP'
ufw --force enable

echo "==> 8/8  Programando respaldo diario de la base de datos (3:00 AM)..."
chmod +x deploy/backup.sh
CRON_LINE="0 3 * * * /bin/bash $APP_DIR/deploy/backup.sh >> $APP_DIR/backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "deploy/backup.sh" ; echo "$CRON_LINE" ) | crontab -

IP=$(curl -s ifconfig.me || echo "TU_IP")
echo ""
echo "============================================================"
echo " ✅  LISTO. El POS ya está en línea."
echo "     Ábrelo en el navegador:   http://$IP"
echo "============================================================"
echo " Comandos útiles:"
echo "   Ver estado:    systemctl status pos-cafeteria"
echo "   Reiniciar:     systemctl restart pos-cafeteria"
echo "   Ver registros: journalctl -u pos-cafeteria -f"
echo "============================================================"
