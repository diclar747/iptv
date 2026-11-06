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
