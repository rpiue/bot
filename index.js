const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Para servir archivos estáticos como el HTML

// Variables globales para almacenar los datos del formulario
let imageUrl = '';
let message = '';

// Usa LocalAuth para guardar la sesión
const client = new Client({
    authStrategy: new LocalAuth()
});

// Genera el código QR y lo envía como JSON
client.on('qr', async (qr) => {
    const qrImageUrl = await qrcode.toDataURL(qr);
    app.get('/get-qr', (req, res) => {
        res.json({ qrCodeUrl: qrImageUrl });
    });
});

// Maneja la autenticación
client.on('authenticated', () => {
    console.log('Cliente autenticado');
});

// Maneja la desconexión
client.on('disconnected', () => {
    console.log('Cliente desconectado');
});

// Escucha mensajes entrantes
client.on('message', async (msg) => {
    const chat = await msg.getChat();

    // Verifica si el mensaje contiene "Plan Basico - Yape Fake" y es un chat privado
    const planRegex = /Plan (Básico|Medium|Premium) - Yape Fake/i;
    if (planRegex.test(msg.body) && !chat.isGroup) {
        // Extraer los detalles del mensaje
        const lines = msg.body.split('\n'); // Dividir el mensaje en líneas
        const nameLine = lines.find(line => line.startsWith('Mi nombre es:'));
        const planLine = lines.find(line => line.startsWith('El Plan:'));

        const name = nameLine ? nameLine.split(': ')[1] : 'Usuario'; // Extraer el nombre
        const plan = planLine ? planLine.split(': ')[1] : 'Plan Básico'; // Extraer el plan

        try {
            // Descargar la imagen desde la URL proporcionada
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageBase64 = Buffer.from(response.data, 'binary').toString('base64');
            
            // Crear el objeto MessageMedia con la imagen descargada (QR)
            const media = new MessageMedia('image/jpeg', imageBase64);

            // Envía la imagen (QR) al chat privado
            await chat.sendMessage(media);

            // Enviar el primer mensaje de texto personalizado después de la imagen
            const customMessage = `
Hola ${name}, gracias por elegir el ${plan}.

Aquí tienes el QR de pago para tu ${plan}. El pago se puede realizar directamente dentro de nuestra aplicación.

**Detalles del Plan:**
- Con este plan, podrás crear contactos ilimitados.
- Contamos con una función avanzada de escaneo de texto, la cual te permitirá subir una imagen que contenga el nombre de la persona objetivo. Nuestro sistema extraerá el nombre automáticamente, facilitando la creación de contactos.

Por favor, envíame la captura del comprobante de pago para proceder con la activación de tu plan.
            `;
            await chat.sendMessage(customMessage);

            // Envía el segundo mensaje con las preguntas y opciones
            const questionMessage = `
¿Tienes alguna pregunta sobre el plan? Elige una opción:
1) Cómo Crear Contactos
2) Cómo usar el Escáner

Y no olvides seguirnos en Instagram: https://www.instagram.com/yape.fake/
            `;
            //await chat.sendMessage(questionMessage);

        } catch (error) {
            console.error('Error al enviar la imagen:', error);
        }

    } else if (msg.hasMedia && msg.type === 'image' && !chat.isGroup){
        // Responder a la imagen (si el usuario responde con la imagen del QR)
        await chat.sendMessage('Ese es el QR donde debes hacer el pago.');

    } else if (!chat.isGroup) {
        // Verifica la respuesta del usuario a las opciones
        //if (msg.body === '1') {
        //    await chat.sendMessage('Para crear contactos, ingresa al menú principal y selecciona la opción "Crear Contacto". Podrás añadir el nombre y número de la persona.');
        //} else if (msg.body === '2') {
        //    await chat.sendMessage('Para usar el escáner, sube una imagen que contenga el nombre de la persona objetivo, y el sistema extraerá el nombre automáticamente.');
        //} else {
        //    await chat.sendMessage('Por favor, selecciona una opción válida: 1) Cómo Crear Contactos, 2) Cómo usar el Escáner.');
        //}
    } else {
        console.log('El mensaje fue enviado desde un grupo, no se enviará respuesta.');
    }
});

// Ruta para manejar el envío de imagen y mensaje desde el formulario
app.post('/send-message', async (req, res) => {
    try {
        // Actualizar las variables globales con los datos del formulario
        imageUrl = req.body.imageUrl;
        message = req.body.message;

        res.send('Imagen y mensaje preparados para enviar en chats privados que mencionen "Plan Basico - Yape Fake".');
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).send('Error al procesar la solicitud');
    }
});

// Inicia el cliente de WhatsApp
client.initialize();

// Inicia el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
