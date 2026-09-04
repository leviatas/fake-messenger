# Historial de cambios

La version vive en el `package.json` de la raiz y se ve en el pie de la app.
Cada cambio la sube y anade su linea aqui, siguiendo [SemVer](https://semver.org/lang/es/):
la tercera cifra para arreglos, la segunda para novedades y la primera para
cambios que rompen algo.

## 1.4.0

- Junto al campo de escribir hay un boton de clip para adjuntar una imagen
  sin arrastrarla: en el movil abre el selector del sistema, que deja elegir
  entre la camara y la galeria.
- En movil, el campo de escribir ocupa toda la altura de su fila, a la par
  con los botones de enviar y adjuntar.

## 1.3.0

- Arrastrar una imagen y soltarla sobre un chat abre un cuadro para anadirle
  un pie de foto (opcional) y enviarla. Se ve en el chat junto a los demas
  mensajes, con su avatar, su hora y su pie de foto si lo tiene.

## 1.2.2

- El avatar de los mensajes se ve otras tres veces mas grande (unas nueve
  veces el tamano original). En pantallas estrechas se queda algo mas
  pequeno para no dejar el texto sin sitio.

## 1.2.1

- Salir de la partida pide confirmacion antes de echar a quien pulsa el boton.
- El avatar de los mensajes se ve unas tres veces mas grande.

## 1.2.0

- Cada persona puede ponerse un nombre propio (unico en la partida) y un
  avatar: un emoji o una imagen que se sube al servidor. Se ve pequeno junto
  al nombre, en la lista de participantes y en los mensajes que se envian.
  Se edita desde la cabecera de la partida.

## 1.1.1

- La pantalla ya no da saltos al desplazarse por el chat en el movil: el alto lo
  resuelve `100dvh`, que sigue a la barra del navegador sin sobresaltos, y solo
  se descuenta el teclado cuando de verdad esta abierto.
- Las hojas inferiores (nuevo chat, compartir, modo administrador) se apoyan
  sobre el teclado en lugar de quedar debajo: sus campos y botones siguen
  siendo alcanzables mientras se escribe.

## 1.1.0

- El pie de la app enseña la version (`v1.1.0`) en el menu, en la pantalla de
  codigos y dentro de la partida.
- Pulsando la version se abre el **modo administrador**: pide la contrasena de
  `ADMIN_PASSWORD` (o la de la mesa si no hay ninguna) y lista las partidas
  creadas con sus participantes, sus codigos y su actividad, con la opcion de
  borrarlas.
- Enlace **Compartir** junto al nombre en la cabecera de la partida: genera
  enlaces de invitacion que abren la app con el codigo puesto. El DM reparte
  los tres roles; un jugador solo puede invitar a jugadores.
- Quien sale de la partida puede volver a entrar con su mismo nombre mientras
  no haya nadie conectado con el, y recupera sus chats privados.

## 1.0.0

- Primera version: partidas con tres codigos de acceso (DM, jugador y
  voyerista), canal general, chats privados y grupos, borrado de mensajes,
  expulsiones, despliegue con Docker y tunel de Cloudflare opcional.
