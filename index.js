const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Middleware para analizar solicitudes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static('public'));

// Variables globales para almacenar los datos del formulario
let imageUrl = '';
let message = '';
let qrCodeUrl = '';

// Usa LocalAuth para guardar la sesión
const client = new Client({
    authStrategy: new LocalAuth()
});

// Genera el código QR y lo envía al cliente web
client.on('qr', async (qr) => {
    try {
        // Generar QR en formato base64
        qrCodeUrl = await qrcode.toDataURL(qr);

        // Cada vez que se actualiza el QR, el cliente lo puede solicitar
        app.get('/get-qr', (req, res) => {
            res.json({ qrCodeUrl });
        });
    } catch (error) {
        console.error('Error generando el QR:', error);
    }
});

// Maneja la autenticación exitosa
client.on('authenticated', () => {
    console.log('Cliente autenticado');
    qrCodeUrl = ''; // Limpiar QR tras autenticación
});

// Maneja la desconexión
client.on('disconnected', async () => {
    console.log('Cliente desconectado');
    try {
        await client.logout(); // O el método correspondiente para limpiar la sesión
    } catch (error) {
        console.error('Error al desconectar:', error);
    }

});

// Maneja mensajes entrantes
client.on('message', async (msg) => {
    const chat = await msg.getChat();

    // Verifica si el mensaje contiene el texto de referencia y no es un grupo
    const planRegex = /Plan (Básico|Medium|Premium) - Yape Fake/i;
    if (planRegex.test(msg.body) && !chat.isGroup) {
        const lines = msg.body.split('\n');
        const nameLine = lines.find(line => line.startsWith('Mi nombre es:'));
        const planLine = lines.find(line => line.startsWith('El Plan:'));

        const name = nameLine ? nameLine.split(': ')[1] : 'Usuario';
        const plan = planLine ? planLine.split(': ')[1] : 'Plan Básico';

        try {
            // Descargar la imagen desde la URL proporcionada
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageBase64 = Buffer.from(response.data, 'binary').toString('base64');
            const media = new MessageMedia('image/jpeg', imageBase64);

            // Enviar la imagen (QR)
            await chat.sendMessage(media);

            // Enviar el mensaje personalizado
            const customMessage = `
Hola ${name}, gracias por elegir el ${plan}.

Aquí tienes el QR de pago para tu ${plan}. El pago se puede realizar directamente dentro de nuestra aplicación.

**Detalles del Plan:**
- Crear contactos ilimitados.
- Función avanzada de escaneo de texto.

Envía la captura del comprobante de pago para proceder con la activación de tu plan.
            `;
            await chat.sendMessage(customMessage);

        } catch (error) {
            console.error('Error al enviar la imagen:', error);
        }
    } else if (msg.hasMedia && msg.type === 'image' && !chat.isGroup) {
        await chat.sendMessage('Ese es el QR donde debes hacer el pago.');
    } else if (!chat.isGroup) {
        // Verifica la respuesta del usuario a las opciones, si es necesario
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
