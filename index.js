const { Client, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const {
  fetchEmailsFromFirestore,
  findEmailInCache,
} = require("./datos-firebase");

const client = new Client({
  // authStrategy: new LocalAuth() // Usar LocalAuth para guardar automáticamente la sesión
});

const clientBot = new Client({});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

let qrImage;
let qrImageBot;
let sessionActive = false;

let sessionActiveBot = false;

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true }); // Mostrar QR en la terminal
  sessionActive = false;
  io.emit("qr", qr); // Emitir el QR al cliente web
  qrImage = qr;
});

client.on("ready", async () => {
  console.log("Cliente listo para enviar mensajes.");
  sessionActive = true; // La sesión está activa
  io.emit("ready");
  io.emit("sessionStatus", sessionActive); // Notificar a los clientes que la sesión está activa
  await fetchEmailsFromFirestore();

});

client.on("authenticated", () => {
  sessionActive = true; // La sesión está activa
  io.emit("sessionStatus", sessionActive);
});

//Cliente para el Bot
clientBot.on("qrBot", (qr) => {
  qrcode.generate(qr, { small: true }); // Mostrar QR en la terminal
  sessionActiveBot = false;
  io.emit("qrBot", qr); // Emitir el QR al cliente web
  qrImageBot = qr;
});

clientBot.on("readybot", async () => {
  console.log("Cliente listo para enviar mensajes.");
  sessionActiveBot = true; // La sesión está activa
  io.emit("readybot");
  io.emit("sessionStatusBot", sessionActive); // Notificar a los clientes que la sesión está activa
  

});

clientBot.on("authenticatedBot", () => {
  sessionActiveBot = true; // La sesión está activa
  io.emit("sessionStatusBot", sessionActive);
});

app.post("/verificar", async (req, res) => {
  const { codigo, numero, nombre } = req.body;

  try {
    if (!codigo || !numero) {
      return res.status(400).send("Faltan parámetros: código o número.");
    }

    const mensaje = `Hola ${nombre}, tu código es *${codigo}*`;
    const mensaje2 = `Recuerda que la aplicación es *GRATIS*. No pagues a nadie. Si alguien intenta venderte la aplicación, no lo reclamarle; simplemente repórtalo escribiendo la palabra *reporte*.`;
    const mensaje3 = `El link de la aplicacion de Yape, BCP estan en el link de mi perfil y las puedes descargar gratuitamente.`;
    const chatId = `51${numero}@c.us`;

    // Enviar el mensaje usando whatsapp-web.js

    client
      .sendMessage(chatId, mensaje)
      .then((response) => {
        client.sendMessage(chatId, mensaje2);
        client.sendMessage(chatId, mensaje3);

        console.log("Mensaje enviado correctamente:");
        return res.status(200).send("Mensaje enviado.");
      })
      .catch((error) => {
        console.error("Error al enviar el mensaje:", error);
        return res.status(500).send("Error al enviar el mensaje.");
      });
  } catch (error) {
    console.error("Error en el servidor:", error);
    res.status(500).send("Error interno del servidor.");
  }
});

let envioActivo = false;
let statuBotGrup = false;
let envioActivoR = false;
let mensajesEnviados = [];

async function leerNumerosDesdeUrl(urlArchivo) {
  const response = await axios.get(urlArchivo);
  return response.data
    .split("\n")
    .map((linea) => {
      const [nombre, numero] = linea.split(",").map((item) => item.trim());
      return { nombre, numero };
    })
    .filter((contacto) => contacto.numero);
}

async function enviarMensajes(url, numeroParaContinuar, imageUrl, text) {
  const contactos = await leerNumerosDesdeUrl(url);
  console.log(contactos);
  const posicionInicio = encontrarPosicion(contactos, numeroParaContinuar) + 1;

  if (posicionInicio === -1) {
    console.log(
      `El número ${numeroParaContinuar} no se encuentra en la lista.`
    );
    return;
  }

  for (let i = posicionInicio; i < contactos.length && envioActivo; i++) {
    const { nombre, numero } = contactos[i];
    const numeroConCodigo = `51${numero}@c.us`;

    const mensajePersonalizado = crearMensajePersonalizado(nombre, text);

    try {
      const contacto = await client.getContactById(numeroConCodigo);
      if (!contacto.isBusiness && !contacto.isUser) {
        console.log(`El número ${numero} no tiene cuenta en WhatsApp.`);
        continue;
      }

      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      const imageBase64 = Buffer.from(response.data, "binary").toString(
        "base64"
      );
      const imagen = new MessageMedia("image/png", imageBase64);

      await client.sendMessage(numeroConCodigo, imagen);
      console.log(`Imagen enviada a ${nombre} (${numero})`);

      await new Promise((resolve) => setTimeout(resolve, 5000));

      await client.sendMessage(numeroConCodigo, mensajePersonalizado);
      console.log(`Mensaje enviado a ${nombre} (${numero})`);
      const fechaHora = new Date().toLocaleString(); // Obtener la fecha y hora actual
      mensajesEnviados.push({
        nombre,
        numero,
        fechaHora,
      });
      io.emit("messageSent", nombre, numero);

      await new Promise((resolve) => setTimeout(resolve, 6000));
    } catch (error) {
      console.error(`Error enviando a ${nombre} (${numero}):`, error);
    }
  }

  console.log("Todos los mensajes han sido enviados.");
}

function crearMensajePersonalizado(nombre, texto) {
  return `¡Hola, *${nombre}*! 👋 Soy *CodexPE*\n` + `${texto}`;
}

function encontrarPosicion(contactos, numeroEspecifico) {
  return contactos.findIndex(
    (contacto) => contacto.numero === numeroEspecifico
  );
}
const ultimosMensajes = {};
let estadosUsuarios = {};

const reportes = new Map();
// Escuchar mensajes recibidos
async function enviarMensajesBot(e) {
  if (!e) return;
  client.on("message", async (msg) => {
    const chat = await msg.getChat();
    const userNumber1 = msg.from.includes("@")
      ? msg.from.split("@")[0]
      : msg.from;

    const userNumber = msg.from; // Número de usuario
    const ahora = Date.now();

    const mensajeActual = msg.body;

    // Si ya hay un mensaje anterior de este usuario
    if (ultimosMensajes[userNumber1]) {
      const { mensajeAnterior, fechaHoraAnterior } =
        ultimosMensajes[userNumber1];

      // Calcula la diferencia en horas entre el mensaje anterior y el actual
      const diferenciaHoras =
        (ahora - new Date(fechaHoraAnterior)) / (1000 * 60 * 60);

      // Si el mensaje es el mismo y ha pasado menos de 1 hora, no respondas
      if (mensajeAnterior === mensajeActual && diferenciaHoras < 1) {
        console.log(
          `El usuario ${userNumber1} ya envió el mismo mensaje recientemente.`
        );
        return;
      }
    }

    // Actualizar el último mensaje y la hora en que fue enviado por el usuario
    ultimosMensajes[userNumber1] = {
      mensajeAnterior: mensajeActual,
      fechaHoraAnterior: ahora,
    };

    const planRegex = /Plan (Basico|Medium|Premium) - Yape Fake/i;
    if (planRegex.test(msg.body) && !chat.isGroup) {
      if (!msg.body.includes("Mi correo:")) return;
      const lines = msg.body.split("\n");
      const nameLine = lines.find((line) => line.startsWith("Mi nombre es:"));
      const planLine = lines.find((line) => line.startsWith("El Plan:"));
      const emailLine = lines.find((line) => line.startsWith("Mi correo:"));
      const email = emailLine ? emailLine.split(": ")[1].trim() : null;
      if (!email) {
        await msg.reply("No se detectó un correo válido en tu mensaje.");
        return;
      }
      console.log(`Verificando el correo: ${email}`);

      const exists = findEmailInCache(email);
      if (exists) {
        const name = nameLine ? nameLine.split(": ")[1] : "Usuario";
        const plan = planLine
          ? planLine.split(":").slice(1).join(":").trim()
          : "Plan Basico";
        console.log(lines);
        console.log(planLine);
        console.log(name);
        console.log(plan);
        const fechaHora = new Date().toLocaleString();
        mensajesEnviados.push({
          name,
          userNumber1,
          fechaHora,
        });

        io.emit("messageSent", name, userNumber1);

        let planDetails = "";

        switch (plan.toLowerCase()) {
          case "plan basico":
            planDetails = `
- **Creación de contactos ilimitados:** Puedes generar todos los contactos que necesites sin ninguna restricción. Ideal para un uso básico de nuestra aplicación.
- **Función de escaneo de texto:** Te ofrecemos la posibilidad de subir imágenes con nombres, y nuestro sistema extraerá automáticamente el texto, facilitando el proceso de creación de nuevos contactos. Esta funcionalidad es especialmente útil cuando tienes listas de contactos en formato de imagen o capturas.`;
            break;
          case "plan medium":
            planDetails = `
- **Creación de contactos ilimitados:** Al igual que el Plan Básico, podrás crear contactos de forma ilimitada.
- **Escaneo de texto avanzado:** Nuestra tecnología te permitirá escanear imágenes con nombres, y automáticamente el sistema los convertirá en contactos.
- **Almacenamiento en la nube:** Todos los contactos que crees estarán respaldados de manera segura en la nube. Esto significa que, si cambias de dispositivo o necesitas reinstalar la aplicación, tus contactos permanecerán intactos. Nunca perderás los datos importantes que hayas almacenado.`;
            break;
          case "plan premium":
            planDetails = `
- **Creación de contactos ilimitados:** Sin restricciones para crear todos los contactos que necesites.
- **Escaneo de texto avanzado:** Extrae automáticamente nombres de imágenes que subas, facilitando la gestión de grandes volúmenes de contactos.
- **Almacenamiento en la nube:** Todos los contactos estarán respaldados en la nube, por lo que no se perderán aunque cambies de dispositivo o desinstales la aplicación.
- **Notificaciones SMS:** Cada vez que realices un pago a un contacto, la otra persona recibirá un SMS notificando el pago. Esta funcionalidad es perfecta si necesitas llevar un registro o confirmar transferencias de manera automática, mejorando la comunicación y seguridad entre los usuarios.`;
            break;
          default:
            planDetails = "Detalles no disponibles para este plan.";
        }

        try {
          // Suponiendo que imageUrl es la URL de la imagen que deseas enviar

          const customMessage = `
Hola ${name}, ¡gracias por elegir el ${plan}!

Nos complace informarte que has seleccionado el *${plan}*.
A continuación, encontrarás los detalles de este plan y lo que incluye:

**Detalles del ${plan}:**${planDetails}`;

          const pasos = `
**Pasos a seguir:**
1. *Realiza el pago:* Escanea el QR que te hemos enviado y efectúa el pago correspondiente a tu plan y *en la descripcion agrega tu correo.*
2. *Confirma el pago:* Una vez que hayas realizado el pago, por favor envíame una captura de pantalla del comprobante para activar tu suscripción.
3. *Disfruta del servicio:* Una vez confirmado el pago, tendrás acceso inmediato a las funcionalidades del ${plan} y podrás disfrutar de todos sus beneficios.

Si tienes alguna duda o necesitas asistencia, no dudes en comunicarte conmigo. Estamos aquí para ayudarte a sacar el máximo provecho de tu plan.

_¡Gracias por confiar en nosotros!_`;

          await chat.sendMessage(customMessage);
          //await new Promise(resolve => setTimeout(resolve, 3000));
          setTimeout(async () => {
            await chat.sendMessage(pasos);
          }, 3000);

          if (imageUrl) {
            const response = await axios.get(imageUrl, {
              responseType: "arraybuffer",
            });
            const imageBase64 = Buffer.from(response.data, "binary").toString(
              "base64"
            );
            const media = new MessageMedia("image/jpeg", imageBase64);

            await chat.sendMessage(media);
          }
        } catch (error) {
          console.error("Error al enviar la imagen:", error);
        }
      }else {
        const responseMessage = "Por favor, envíanos un audio para más información.";
        await msg.reply(responseMessage);
      }
    }
    if (msg.body.toLowerCase().includes("reporte") && !chat.isGroup) {
      const lastReportTime = reportes.get(userNumber); // Obtiene la última hora de reporte

      // Verifica si puede enviar un nuevo reporte
      if (!lastReportTime || ahora - lastReportTime >= 24 * 60 * 60 * 1000) {
        reportes.set(userNumber, ahora); // Actualiza la hora del último reporte
        await chat.sendMessage(`Hola, envíame las capturas de lo que pasó.`);
        let respondido = false;
        const capturasRecibidas = []; // Almacena las capturas recibidas
        const timeout = setTimeout(async () => {
          if (capturasRecibidas.length === 0) {
            await chat.sendMessage(
              `Por favor, envíame una captura de la estafa para que podamos investigar adecuadamente.`
            );
          }
        }, 30000); // Espera de 30 segundos

        // Escucha los msgs
        const messageListener = async (msg) => {
          if (msg.from === userNumber) {
            // Si se recibe una imagen
            if (msg.hasMedia && msg.type === "image") {
              capturasRecibidas.push(msg); // Almacena la captura recibida
              clearTimeout(timeout); // Cancela el temporizador

              await chat.sendMessage(
                `Lamentamos mucho lo sucedido y agradecemos que nos lo hayas informado. Empezaremos a investigar a fondo tu reporte para dar con el estafador. Tu seguridad es muy importante para nosotros.`
              );
              client.off("message", messageListener);
              return; // Sale de la función después de manejar la imagen
            }

            // Si se recibe texto pero no hay imágenes
            if (msg.body && msg.body.toLowerCase() !== "reporte") {
              clearTimeout(timeout); // Cancela el temporizador
              respondido = true;
              await chat.sendMessage(
                `Recibí tu mensaje, pero por favor, envíame las capturas de la estafa para que podamos investigar adecuadamente.`
              );
              client.off("message", messageListener);
            }
          }
        };
        client.on("message", messageListener);
      } else {
        // Si han enviado "reporte" dentro de las últimas 24 horas
        await chat.sendMessage(
          `Ya recibí tu reporte reciente. Por favor, envíame información adicional si es necesario.`
        );
      }
    } else {
      console.log(
        "El mensaje fue enviado desde un grupo, no se enviará respuesta."
      );
    }
  });
}

let gruposPermitidos = [
  { id: "120363336928180852@g.us", nombre: "Codex Apps" },
  { id: "120363341798146718@g.us", nombre: "." },
];

async function obtenerGrupos() {
  try {
    const chats = await client.getChats();
    gruposPermitidos = chats
      .filter((chat) => chat.isGroup) // Filtrar solo los grupos
      .map((chat) => ({ id: chat.id._serialized, nombre: chat.name })); // Obtener ID y nombre del grupo

    console.log("Grupos permitidos:", gruposPermitidos);
    io.emit("gruposPermitidos", gruposPermitidos); // Emitir la lista de grupos al cliente web
  } catch (error) {
    console.error("Error al obtener los grupos:", error);
  }
}

const activeUsers = new Map(); // Guardar el estado del flujo de los usuarios
let messageListener = null;
async function enviarMensajeEnGrupo(bot) {
  if (!bot) {
    if (messageListener) {
      client.removeListener("message", messageListener); // Eliminar el listener si existe
      messageListener = null; // Limpiar la referencia
    }
    //io.emit("alert", `El bot está desactivado: statuBotGrup = ${bot}`);
    return; // Salida temprana si bot es false
  }

  const mensajeMenu = `*Menú de Ayuda*:
   1️⃣ *Cómo Crear Contactos*
   2️⃣ *Cómo funciona el Escáner*
   3️⃣ *Planes de Suscripción*
   4️⃣ *Error de Suscripción*
   5️⃣ *Error de Dispositivo*
Responde con el número de la opción para más detalles.`;

  messageListener = async (msg) => {
    const chat = await msg.getChat();

    // Verificar si el mensaje proviene de un grupo permitido
    if (
      chat.isGroup &&
      gruposPermitidos.some((grupo) => grupo.id === chat.id._serialized)
    ) {
      // Comando para mostrar el menú de opciones
      if (msg.body.startsWith("/ayuda")) {
        // Responder al mensaje de ayuda y activar el flujo para el usuario
        await chat.sendMessage(mensajeMenu, {
          quotedMessageId: msg.id._serialized,
        });
        activeUsers.set(msg.from, { isActive: true, timestamp: Date.now() });

        // Temporizador para finalizar el flujo después de 1 minuto si no hay respuesta
        reiniciarTemporizador(msg.from);
        return;
      }
      if (msg.body.startsWith("/sticker89") && msg.hasMedia) {
        try {
          const media = await msg.downloadMedia(); // Descarga el medio

          if (media) {
            console.log("Tipo de medio:", media.mimetype); // Verifica el tipo de medio
            console.log("Tamaño de datos:", media.data.length); // Verifica el tamaño de los datos

            const buffer = Buffer.from(media.data, "base64"); // Convierte el string base64 a buffer

            await client.sendMessage(buffer, {
              quotedMessageId: msg.id._serialized,
              sendMediaAsSticker: true,
              mimetype: media.mimetype,
              stickerMetadata: {
                // Si tu biblioteca lo requiere, puedes incluir metadata
                name: `sticker_${msg.from.split("@")[0]}`, // Nombre del sticker
              },
            });

            console.log(`Sticker enviado a ${msg.from}`);
          } else {
            console.log("No se pudo descargar el medio.");
          }
        } catch (error) {
          console.error("Error al procesar el sticker:", error);
        }
      }
      // Verificar si el flujo está activo para el usuario
      if (activeUsers.has(msg.from) && activeUsers.get(msg.from).isActive) {
        if (msg.hasQuotedMsg) {
          const quotedMsg = await msg.getQuotedMessage();

          // Verificar si la respuesta está citando al menú
          if (quotedMsg.body.includes("*Menú de Ayuda*")) {
            let respuesta = obtenerRespuesta(msg.body.trim());
            const base = `\n_Recuerda escribir */ayuda* para volver a mostrar el menú_`;

            // Responder al usuario
            await chat.sendMessage(respuesta + base, {
              quotedMessageId: msg.id._serialized,
            });
            await chat.sendMessage(mensajeMenu);

            // Reiniciar el temporizador
            reiniciarTemporizador(msg.from);
          }
        } else {
          console.log("El usuario debe responder al mensaje de ayuda.");
        }
      } else if (!msg.body.startsWith("/")) {
        console.log("El usuario debe iniciar el flujo con /ayuda.");
      }
    } else {
      console.log(
        "El mensaje proviene de un grupo no permitido o no es un grupo."
      );
    }
  };
  client.on("message", messageListener);

  // Listener para detectar cuando un nuevo miembro se une al grupo
  client.on("group_join", async (notification) => {
    try {
      const chat = await client.getChatById(notification.chatId);
      if (gruposPermitidos.some((grupo) => grupo.id === chat.id._serialized)) {
        const contactId = notification.id.participant;

        // Verifica que el contactId sea una cadena antes de continuar
        if (typeof contactId !== "string") {
          throw new Error("El ID del contacto no es válido.");
        }

        const contact = await client.getContactById(contactId);
        const profilePicUrl = await contact.getProfilePicUrl();
        const nombreUsuario =
          contact.pushname || contact.notifyName || "Usuario"; // Obtiene el nombre del usuario

        // Crear el mensaje de bienvenida con la etiqueta
        const mensajeBienvenida = `👋 ¡Hola @${contact.id.user}! Bienvenido/a al grupo *${chat.name}*! 🎉

✨ Estamos encantados de tenerte aquí. Si necesitas ayuda, no dudes en escribir */ayuda* para explorar todas las opciones disponibles.

🚫 *Normas del grupo*:
- No se permite insultar ❌
- Prohibido enviar contenido para adultos 🔞
- Hablar en privado sin permiso está prohibido 🙅‍♂️
- Reporta cualquier estafa de parte de algún miembro del grupo 📢

🔔 *Recuerda que la app es gratuita*. Si pagaste por obtenerla, por favor escríbeme al privado con la palabra *reporte*.

📋 Asegúrate de revisar la descripción del grupo, donde encontrarás los enlaces a las apps, grupos y canales.

¡Esperamos que disfrutes de tu estancia y te diviertas con nosotros! 😄`;

        let imageUrlToSend;

        // Si el usuario tiene foto de perfil, usa esa URL
        if (profilePicUrl) {
          imageUrlToSend = profilePicUrl;
        } else {
          // Si no tiene foto de perfil, usa la foto de perfil del grupo
          imageUrlToSend = await client.getProfilePicUrl(chat.id._serialized);
        }

        // Envía la imagen y el mensaje de bienvenida
        if (imageUrlToSend) {
          // Obtener la imagen como base64
          const response = await axios.get(imageUrlToSend, {
            responseType: "arraybuffer",
          });
          const imageBase64 = Buffer.from(response.data, "binary").toString(
            "base64"
          );
          const imagen = new MessageMedia("image/png", imageBase64);

          // Enviar la imagen con el mensaje de bienvenida y mencionar al usuario
          await chat.sendMessage(imagen, {
            caption: mensajeBienvenida,
            mentions: [contactId],
          });
        } else {
          // Si no hay foto de perfil ni del grupo, solo envía el mensaje de bienvenida
          await chat.sendMessage(mensajeBienvenida, { mentions: [contactId] });
        }
      }
    } catch (error) {
      console.error("Error al enviar el mensaje de bienvenida:", error);
    }
  });
}

// Función para obtener la respuesta basada en la opción seleccionada
function obtenerRespuesta(opcion) {
  switch (opcion) {
    case "1":
      return `*Cómo Crear Contactos:*\nSigue este enlace para aprender a crear contactos: https://www.instagram.com/reel/C9qXx8RRDVs/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==`;
    case "2":
      return `*Cómo funciona el Escáner:*\nEl escáner no detecta códigos QR como tal. En los detalles aparece "Escáner QR (Texto)", lo que significa que el escáner necesita una imagen donde se muestre el nombre de la víctima. Específicamente, debe ser una imagen como la que te envié. Si observas, en la parte superior de la imagen aparece el nombre completo de la víctima.

*Para proceder, sigue estos pasos:*

1. Ingresa a "Escanear QR".
2. Haz clic en "Subir una imagen".
3. Sube la imagen que te envié.

Si quieres ver en video cómo funciona, ingresa aquí:
https://www.instagram.com/yape.fake/
`;
    case "3":
      return `*Planes de Suscripción:*\nLos planes de suscripción te dan beneficios como yapear sin límites y crear contactos sin restricciones. Los planes son mensuales y las actualizaciones son gratis.`;
    case "4":
      return `*Error de Suscripción:*\nEste error ocurre porque no has comprado un plan o tu plan ya ha vencido. Revisa tu estado de suscripción o adquiere uno nuevo.`;
    case "5":
      return `*Error de Dispositivo:*\nEsto sucede si alguien más intenta usar tu cuenta en otro dispositivo. Recuerda que solo puedes usar una cuenta por dispositivo. Si cambiaste de teléfono, envíame un mensaje privado con la palabra "nuevo movil" para actualizar tu acceso.`;
    default:
      return "Por favor, selecciona una opción válida del menú de ayuda.";
  }
}

// Función para reiniciar el temporizador de inactividad
function reiniciarTemporizador(usuario) {
  setTimeout(() => {
    if (activeUsers.has(usuario)) {
      activeUsers.delete(usuario);
      console.log(`Flujo terminado para ${usuario} por inactividad.`);
    }
  }, 300000); // 5 minutos (300000 milisegundos)
}

// El resto de tu código para manejar el mensaje sigue igual

client.initialize();

io.on("connection", (socket) => {
  socket.on("setBotGrup", async () => {
    var es = !statuBotGrup;
    statuBotGrup = es;
    const estadoEnvio = statuBotGrup ? "activado" : "desactivado";
    await enviarMensajeEnGrupo(statuBotGrup);
    socket.emit("status", statuBotGrup);
  });

  socket.on("setImageUrl", (url) => {
    imageUrl = url; // Establecer la URL de la imagen
    console.log(`URL de la imagen establecida: ${imageUrl}`);
    socket.emit("alert", "Imagen establecida correctamente.");
    // obtenerGrupos();
  });

  socket.on("toggleEnvio", async () => {
    var f = !envioActivoR;
    envioActivoR = f;

    const estadoEnvio = f ? "activado" : "desactivado";
    await enviarMensajesBot(f);
    socket.emit("alert", `El envío de mensajes ha sido ${estadoEnvio}.`);
  });

  socket.on("iniciar-envio", (url, numeroParaContinuar, img, txt) => {
    envioActivo = true;
    enviarMensajes(url, numeroParaContinuar, img, txt);
    console.log(txt);
  });

  socket.on("empezar-de-cero", async (url, img, text) => {
    envioActivo = true;
    const numeroParaContinuar = "";
    await enviarMensajes(url, numeroParaContinuar, img, text);
  });

  socket.on("detener-envio", () => {
    envioActivo = false;
    console.log("El envío de mensajes ha sido detenido.");
  });

  socket.on("requestData", () => {
    const initialData = {
      mensajesEnviados: mensajesEnviados, // variable que mantiene el conteo de mensajes enviados
      qrImage: qrImage, // Asegúrate de que qrImage se define y almacena correctamente
      sessionActive: sessionActive,
      botGrup: statuBotGrup,
    };
    socket.emit("initialData", initialData);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor en ejecución en http://localhost:${PORT}`);
});
