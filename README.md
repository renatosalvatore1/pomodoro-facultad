# Pomodoro Facultad

App de productividad: timer Pomodoro con métricas semanales y lista de tareas, sincronizada entre la Mac y el iPhone.

Las tareas completadas se borran; en la nube queda solo una marca de "hecha" (30 días) para que otro dispositivo desactualizado no la vuelva a agregar.

## Cómo está armado

| Parte | Qué hace |
| --- | --- |
| `public/index.html` | La app completa (React incluido, funciona sin conexión). |
| `api/data.js` | Función de Vercel que lee y guarda los datos. |
| `lib/handler.js` | La lógica de esa función. |
| Vercel Blob (privado) | Donde quedan los datos: `pomodoro/actual.json` (ajustes, timer y mes en curso) y `pomodoro/historial/h-AAAA-MM.json` (meses anteriores). |

## Configuración en Vercel

1. Un Blob store **privado** conectado a este proyecto (pestaña Storage).
2. La variable de entorno `POMODORO_KEY` con una clave larga. La app la pide la primera vez en cada dispositivo.

Después de cambiar cualquiera de las dos cosas hay que volver a desplegar (Deployments → Redeploy).

## Uso del plan gratis

El plan Hobby incluye 2.000 escrituras por mes en Blob. La app agrupa los cambios (como mucho una escritura por minuto, y más espaciadas si el mes viene cargado) y muestra el contador en Ajustes → Datos.
