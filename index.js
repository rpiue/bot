const { Client, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const QRCode = require("qrcode"); // Importar la biblioteca qrcode

const client = new Client();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});
let qrImage;
let sessionActive = false;

client.on("qr", async (qr) => {
  try {
    // Generar el código QR como una imagen en formato base64
    qrImage = await QRCode.toDataURL(qr);
    io.emit("qr", qrImage); // Emitir la imagen QR al cliente
    sessionActive = false; // La sesión no está activa mientras se escanea el QR
    io.emit("sessionStatus", sessionActive);
  } catch (error) {
    console.error("Error generando QR:", error);
  }
});

client.on("ready", () => {
  console.log("Cliente listo para enviar mensajes.");
  sessionActive = true; // La sesión está activa
  io.emit("ready");
  io.emit("sessionStatus", sessionActive); // Notificar a los clientes que la sesión está activa
});

client.on("authenticated", () => {
  sessionActive = true; // La sesión está activa
  io.emit("sessionStatus", sessionActive);
});

let envioActivo = false;
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

async function enviarMensajes(url, numeroParaContinuar, imageUrl) {
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

    const mensajePersonalizado = crearMensajePersonalizado(nombre);

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

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await client.sendMessage(numeroConCodigo, mensajePersonalizado);
      console.log(`Mensaje enviado a ${nombre} (${numero})`);
      const fechaHora = new Date().toLocaleString(); // Obtener la fecha y hora actual
      mensajesEnviados.push({
        nombre,
        numero,
        fechaHora,
        mensaje: mensajePersonalizado, // O el mensaje que desees guardar
      });
      io.emit("messageSent", nombre, numero);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`Error enviando a ${nombre} (${numero}):`, error);
    }
  }

  console.log("Todos los mensajes han sido enviados.");
}

function crearMensajePersonalizado(nombre) {
  return (
    `¡Hola, ${nombre}! 👋 Soy CodexPE\n` +
    `¿Qué pasó? ¿Por qué dejaste de usar la app Yape Fake? 😕\n\n` +
    `¡Ya hay una nueva versión mejorada! 🚀\n\n` +
    `Hemos implementado una tienda virtual 🛒 para que puedas comprar con seguridad y garantía. 🛡️\n\n` +
    `*Importante:*\n\nEl *20 de octubre* habrá una eliminación de cuentas que no hayan actualizado la app. ⚠️\n\n` +
    `No te pierdas de la app más realista y económica del mercado.\n\n *Instala la nueva versión aquí:* \n` +
    `https://www.mediafire.com/file/676d35gs8ij0mrb/Yape-Fake.apk/file\n\n` +
    `_¡Estamos seguros de que te encantará!_ ❤️`
  );
}

function encontrarPosicion(contactos, numeroEspecifico) {
  return contactos.findIndex(
    (contacto) => contacto.numero === numeroEspecifico
  );
}

// Escuchar mensajes recibidos
client.on("message", async (msg) => {
  const chat = await msg.getChat();

  const planRegex = /Plan (Básico|Medium|Premium) - Yape Fake/i;
  if (planRegex.test(msg.body) && !chat.isGroup && envioActivoR) {
    const lines = msg.body.split("\n");
    const nameLine = lines.find((line) => line.startsWith("Mi nombre es:"));
    const planLine = lines.find((line) => line.startsWith("El Plan:"));

    const name = nameLine ? nameLine.split(": ")[1] : "Usuario";
    const plan = planLine ? planLine.split(": ")[1] : "Plan Básico";

    try {
      // Suponiendo que imageUrl es la URL de la imagen que deseas enviar
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

      const customMessage = `
Hola ${name}, gracias por elegir el ${plan}.

Aquí tienes el QR de pago para tu ${plan}. El pago se puede realizar directamente dentro de nuestra aplicación.

**Detalles del Plan:**
- Con este plan, podrás crear contactos ilimitados.
- Contamos con una función avanzada de escaneo de texto, la cual te permitirá subir una imagen que contenga el nombre de la persona objetivo. Nuestro sistema extraerá el nombre automáticamente, facilitando la creación de contactos.

Por favor, envíame la captura del comprobante de pago para proceder con la activación de tu plan.`;
      await chat.sendMessage(customMessage);

      const questionMessage = `
¿Tienes alguna pregunta sobre el plan? Elige una opción:
1) Cómo Crear Contactos
2) Cómo usar el Escáner

Y no olvides seguirnos en Instagram: https://www.instagram.com/yape.fake/`;
      await chat.sendMessage(questionMessage);
    } catch (error) {
      console.error("Error al enviar la imagen:", error);
    }
  } else if (msg.hasMedia && msg.type === "image" && !chat.isGroup) {
    await chat.sendMessage("Ese es el QR donde debes hacer el pago.");
  } else {
    console.log(
      "El mensaje fue enviado desde un grupo, no se enviará respuesta."
    );
  }
});

client.initialize();

io.on("connection", (socket) => {
  socket.on("setImageUrl", (url) => {
    imageUrl = url; // Establecer la URL de la imagen
    console.log(`URL de la imagen establecida: ${imageUrl}`);
  });

  socket.on("toggleEnvio", () => {
    envioActivoR = !envioActivoR;
    console.log(`Envio activo: ${envioActivoR}`);
  });

  socket.on("iniciar-envio", (url, numeroParaContinuar, img) => {
    envioActivo = true;
    enviarMensajes(url, numeroParaContinuar, img);
  });

  socket.on("empezar-de-cero", async (url, img) => {
    envioActivo = true;
    const numeroParaContinuar = "";
    await enviarMensajes(url, numeroParaContinuar, img);
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
    };
    socket.emit("initialData", initialData);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor en ejecución en http://localhost:${PORT}`);
});
