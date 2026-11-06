# Afiliados y billetera

Cada cuenta de usuario dispone de su enlace de referencia en **Afiliados y billetera**. El registro toma `?ref=usuario` y mantiene la relación con el afiliado. No se vende ni transfiere saldo de créditos.

El plan mensual cuesta Gs. 27.500 por 30 días. El usuario informa la referencia de su pago. El administrador verifica el ingreso real en **Pagos de planes** antes de aprobarlo. La aprobación extiende el plan y acredita Gs. 13.750 al afiliado si su propia cuenta está habilitada y su plan sigue vigente en ese instante. Se repite con cada mensualidad. Si no cumple, queda registrada como comisión no generada; no se recupera retroactivamente.

Los créditos y las transacciones del modelo anterior permanecen archivados y no se convierten en guaraníes. Sus rutas de operación devuelven HTTP 410. Los roles antiguos se conservan para mantener las relaciones de los datos, pero todos los usuarios no administradores necesitan una fecha de suscripción vigente para reproducir contenido.

## Retiros

El afiliado guarda banco, titular y cuenta o alias en su perfil. Al pedir un retiro se guarda una copia de esos datos y se reserva el importe en el libro de movimientos. Editar el perfil después no cambia el destino de una solicitud ya enviada.

En **Solicitudes de retiro**, el administrador realiza la transferencia mediante su banco y luego registra su referencia. Esta aplicación registra la transferencia; no ejecuta transferencias bancarias. Rechazar una solicitud libera el importe una sola vez.

Cada solicitud lleva una identificación única. Las aprobaciones y retiros utilizan transacciones, bloqueos por fila e índices únicos para evitar acreditar o descontar dos veces. Una misma referencia bancaria confirmada no puede aprobar dos mensualidades distintas.

## Instalación y verificación

`initSchema` aplica `server/db/affiliates.sql` al iniciar. El cambio es aditivo; conservar el esquema al revertir una versión y no borrar el libro de movimientos.

`node server/scripts/verify-affiliates.mjs` crea un esquema temporal aislado, copia la estructura de usuarios y prueba mensualidades repetidas, aprobaciones simultáneas, planes vencidos, retiros concurrentes, rechazos, datos bancarios e idempotencia. Elimina exclusivamente ese esquema temporal al terminar. No modifica las cuentas ni el dinero reales.

En Android, el botón **Afiliados y billetera** abre el mismo flujo de la web dentro de una vista autenticada del propio dominio. Se mantiene accesible con un plan vencido para renovar y consultar las ganancias ya generadas. Al cerrar, se actualiza el estado de la cuenta nativa.

## Comprobantes y cuentas bancarias

En **Pagar o renovar mi plan** se muestran los datos del administrador y, si está configurado y corresponde a la cuenta vigente, su QR. El usuario adjunta una imagen JPG, PNG o WebP de hasta 8 MB, mediante archivos o cámara. Las imágenes se guardan fuera del directorio público, en `MEDIA_STORAGE_DIR/_payments`; solo su dueño y los administradores pueden consultarlas. Los datos bancarios y el QR real de producción no se incluyen en Git.

En **Solicitudes** se revisan tanto pagos de planes como retiros. Aprobar un pago registra su referencia confirmada, extiende la vigencia y acredita una única comisión del 50% cuando el referente cumple las condiciones. Una cortesía administrativa no genera comisiones. El administrador puede activar 1, 2, 3, 6 o 12 meses y debe distinguir pago verificado de cortesía.

El afiliado puede guardar hasta diez cuentas bancarias, elegir una al pedir un retiro y consultar el destino registrado. Quitar una cuenta no altera las solicitudes anteriores. El perfil conserva sus datos personales, avatar y cambio de contraseña; cambiarla revoca las otras sesiones.

## Avisos propios

Los avisos de activación, comisión, pago observado, nuevo contenido y retiros se guardan dentro de la misma transacción que la operación. La campana web los consulta cada 15 segundos mientras la página está visible. La APK consulta directamente al servidor Node mediante JobScheduler de Android, sin Firebase, OneSignal ni otro intermediario. Android impone un intervalo mínimo de 15 minutos y puede demorar tareas por ahorro de batería; una aplicación detenida forzosamente debe volver a abrirse. No se promete entrega inmediata con la APK cerrada. Las transferencias bancarias continúan siendo manuales: el aviso indica que el administrador registró el pago, no que la aplicación transfirió dinero.

`node server/scripts/verify-payment-flow.mjs` verifica por HTTP sesiones persistentes, permisos, comprobantes privados, cuentas bancarias, pago repetido, comisión única, avisos, activaciones de varios meses y papelera en un esquema temporal aislado. No usar datos financieros de prueba en producción.
