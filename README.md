# Mantenimiento y Servicios Generales

Tablero web para consultar, filtrar, comparar y descargar los registros de
`BD_ManttoSSGG`.

## Actualización de datos

Reemplace el archivo ubicado en `data/BD_ManttoSSGG.csv`. Mientras se corrige
el nombre de la primera carga, la aplicación también reconoce
`data/BD_ManttoSSGG.csv.csv`.

Cuando cambia el CSV, GitHub Actions genera automáticamente
`data/dashboard.json.gz`, una versión comprimida que acelera la carga del
tablero. El CSV original se conserva como respaldo.

## Publicación

En GitHub, abra **Settings > Pages**, elija **Deploy from a branch**, seleccione
la rama **main** y la carpeta **/(root)**.
