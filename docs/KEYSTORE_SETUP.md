# Crear la clave de subida Android

La clave debe crearla y custodiarla el propietario de la cuenta de Google Play. No la subas al repositorio ni la envíes por chat.

## 1. Crear el archivo

Con Java instalado:

```powershell
keytool -genkeypair -v -keystore combusplus-upload.jks -alias combusplus-upload -keyalg RSA -keysize 4096 -validity 10000
```

Guarda las contraseñas en un gestor seguro.

## 2. Convertir a Base64 para GitHub

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("combusplus-upload.jks")) | Set-Clipboard
```

Crea estos secretos en GitHub:

```text
ANDROID_KEYSTORE_BASE64=<contenido Base64>
KEYSTORE_PASSWORD=<contraseña del almacén>
KEY_ALIAS=combusplus-upload
KEY_PASSWORD=<contraseña de la clave>
```

## 3. Copias de seguridad

Conserva al menos dos copias cifradas y separadas del archivo `.jks`. Google Play App Signing protege la clave de firma de distribución, pero necesitas la clave de subida para futuras versiones.
