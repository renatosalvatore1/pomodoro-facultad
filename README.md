# Pomodoro Facultad

App de productividad: timer Pomodoro con métricas semanales y lista de tareas, sincronizada entre la Mac y el iPhone.

Las tareas completadas se borran; en la nube queda solo una marca de "hecha" (30 días) para que otro dispositivo desactualizado no la vuelva a agregar.

En la misma pestaña hay un cuadro de fechas importantes (exámenes, entregas y otras) ordenadas por cercanía, con cuánto falta para cada una. Tocando una se edita o se borra; también se sincronizan entre dispositivos.

## Cómo está armado

| Parte | Qué hace |
| --- | --- |
| `public/index.html` | La app completa (React incluido, funciona sin conexión). |
| `api/data.js` | Función de Vercel que lee y guarda los datos. |
| `lib/handler.js` | La lógica de esa función. |
| Vercel Blob (privado) | Donde quedan los datos: `pomodoro/actual.json` (ajustes, timer y mes en curso) y `pomodoro/historial/h-AAAA-MM.json` (meses anteriores). |

## Sonido para concentrarse

En la pestaña Timer se elige un sonido de fondo (arroyo, ruido rosa o ruido blanco) que suena mientras corre el trabajo y se corta en la pausa y el descanso. Se genera en el navegador (sin archivos), se elige por dispositivo y suena solo en el dispositivo donde arrancaste el trabajo.

## Finanzas (/finanzas)

App aparte (se instala en el iPhone como otra app) para registrar ingresos, gastos, cuotas y gastos o ingresos fijos de todos los meses. La pantalla principal muestra cuánto queda para gastar en el mes y un gráfico día por día de cuánto podés gastar y cuánto gastaste: lo que queda se reparte entre los días que faltan, y si un día te pasás, los siguientes quedan en negativo hasta compensarlo. También muestra lo ya comprometido en cuotas para los próximos meses y avisa de gastos chicos que suman mucho.

- Los datos viven en `finanzas/datos.json` del mismo Blob privado, a través de `api/finanzas.js`, con la misma clave (`POMODORO_KEY`).
- Cada dispositivo guarda una copia local y sube los cambios a los pocos segundos; si dos dispositivos guardan a la vez, se unen (lo borrado no vuelve).
- Se puede descargar todo como planilla CSV.

## Widget del tren (iPhone)

`/widget` es una página para instalar un widget de [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) con los próximos trenes del ramal Retiro – J. L. Suárez (Mitre). El widget consulta `/api/trenes`, que toma los datos de [api-trenes](https://github.com/ariedro/api-trenes) (no oficial) y los simplifica:

- `GET /api/trenes/Miguelete/Belgrano%20R` o `GET /api/trenes?estacion=Miguelete&destino=Belgrano R`: solo los trenes que te llevan a ese destino, con la hora a la que llegás.
- Sin `destino` muestra los dos sentidos (o uno solo con `hacia=Retiro` / `hacia=Suárez`); `GET /api/trenes` lista las estaciones.
- Las respuestas se guardan 20 segundos en la caché de Vercel para no cargar la fuente.
- Para usar otra instancia de api-trenes, definí la variable `TRENES_API_URL`.

## Configuración en Vercel

1. Un Blob store **privado** conectado a este proyecto (pestaña Storage).
2. La variable de entorno `POMODORO_KEY` con una clave larga. La app la pide la primera vez en cada dispositivo.

Después de cambiar cualquiera de las dos cosas hay que volver a desplegar (Deployments → Redeploy).

## Uso del plan gratis

El plan Hobby incluye 2.000 escrituras por mes en Blob. La app agrupa los cambios (como mucho una escritura por minuto, y más espaciadas si el mes viene cargado) y muestra el contador en Ajustes → Datos.
