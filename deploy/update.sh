#!/bin/bash
# ============================================================
#  Actualizar el POS con los últimos cambios del código.
#  Ejecutar como root:   sudo bash deploy/update.sh
#  NO toca la base de datos ni las fotos: solo el código.
# ============================================================
set -e
APP_DIR=/opt/pos-cafeteria
cd "$APP_DIR"

echo "==> Descargando últimos cambios..."
git pull

echo "==> Actualizando librerías..."
./venv/bin/pip install -r requirements.txt

echo "==> Ajustando permisos..."
chown -R www-data:www-data "$APP_DIR"

echo "==> Reiniciando el POS..."
systemctl restart pos-cafeteria

echo "✅ Actualizado. El POS sigue en línea con los nuevos cambios."
