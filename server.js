require('dotenv').config();
const express = require('express');
const aws4 = require('aws4');
const { parseStringPromise } = require('xml2js');
const cors = require('cors');
const app = express();

// Configuración básica
app.use(cors());

// Endpoint para buscar libros por ASIN
app.get('/api/amazon-book', async (req, res) => {
    const asin = req.query.asin;
    
    if (!asin || asin.length < 10) {
        return res.status(400).json({ 
            error: 'ASIN inválido', 
            message: 'El ASIN debe tener al menos 10 caracteres' 
        });
    }

    try {
        // Configurar parámetros para la API de Amazon
        const params = {
            Service: 'ProductAdvertisingAPI',
            Version: '2011-08-01',
            Operation: 'ItemLookup',
            ResponseGroup: 'ItemAttributes,Images',
            IdType: 'ASIN',
            ItemId: asin,
            AWSAccessKeyId: process.env.AWS_ACCESS_KEY_ID
        };

        // Configurar la petición firmada
        const opts = {
            service: 'ProductAdvertisingAPI',
            region: 'us-east-1',
            method: 'GET',
            path: '/onca/xml',
            host: 'webservices.amazon.com',
            params: params
        };

        // Firmar la petición
        aws4.sign(opts, {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        });

        // Construir la URL firmada
        const signedUrl = `https://${opts.host}${opts.path}?${new URLSearchParams(opts.params).toString()}`;
        
        // Hacer la petición a Amazon
        const response = await fetch(signedUrl);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status} de Amazon API`);
        }
        
        // Procesar la respuesta XML
        const xmlText = await response.text();
        const bookData = await parseAmazonXml(xmlText, asin);
        
        // Enviar los datos al frontend
        res.json(bookData);
        
    } catch (error) {
        console.error('Error en la API de Amazon:', error);
        res.status(500).json({ 
            error: 'Error al obtener datos del libro',
            details: error.message 
        });
    }
});

// Función para convertir XML a JSON
async function parseAmazonXml(xml, asin) {
    try {
        const result = await parseStringPromise(xml);
        
        // Extraer título
        const title = result.ItemLookupResponse?.Items?.[0]?.Item?.[0]?.ItemAttributes?.[0]?.Title?.[0] || `Book ${asin}`;
        
        // Extraer autor(es)
        let authors = [];
        const authorData = result.ItemLookupResponse?.Items?.[0]?.Item?.[0]?.ItemAttributes?.[0]?.Author;
        if (authorData) {
            authors = Array.isArray(authorData) ? authorData : [authorData];
        }
        
        // Extraer imagen
        let coverUrl = 'https://via.placeholder.com/300x450.png?text=Book+Not+Found';
        const largeImage = result.ItemLookupResponse?.Items?.[0]?.Item?.[0]?.LargeImage?.[0]?.URL;
        if (largeImage && largeImage[0]) {
            coverUrl = largeImage[0];
        }
        
        return {
            title: title,
            author: authors.length > 0 ? authors.join(', ') : 'Unknown Author',
            coverUrl: coverUrl,
            asin: asin
        };
    } catch (error) {
        console.error('Error parsing Amazon XML:', error);
        return {
            title: `Book ${asin}`,
            author: 'Unknown Author',
            coverUrl: 'https://via.placeholder.com/300x450.png?text=Book+Not+Found',
            asin: asin
        };
    }
}

// Iniciar el servidor
const port = process.env.PORT || 10000;
app.listen(port, () => {
    console.log(`Servidor backend iniciado en el puerto ${port}`);
});