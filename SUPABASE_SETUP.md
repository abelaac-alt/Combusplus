# Supabase para Combusplus 10.6.3

La instalación vigente está documentada en [docs/INSTALLATION_V9.md](docs/INSTALLATION_V9.md).

Combusplus no utiliza `APP_ACCESS_TOKEN` ni `COMBUSPLUS_APP_ACCESS_TOKEN`. El acceso de usuario se basa en sesiones anónimas firmadas por instalación, límites de uso y Play Integrity para Android.

El backend de producción debe desplegarse mediante `.github/workflows/deploy-supabase.yml`; así se aplican las migraciones, los secretos y las Edge Functions con la misma configuración.
