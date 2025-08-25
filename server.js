require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // ¡ESTA LÍNEA FALTABA!
const crypto = require('crypto');
const cors = require('cors');
const app = express();

app.use(cors());

// Función para generar el encabezado de autorización
function generateAuthorizationHeader(payload, host, uri, awsAccessKey, awsSecretKey, associateTag) {
    const t = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    
    // Crear el cuerpo de la solicitud
    const payloadString = JSON.stringify(payload);
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');
    
    // Cabeceras para la firma
    const canonicalHeaders = `host:${host}\nx-amz-date:${t}\n`;
    const signedHeaders = 'host;x-amz-date';
    
    // Ruta de la API
    const canonicalUri = uri;
    
    // Parámetros de consulta (vacío para POST)
    const canonicalQueryString = '';
    
    // Método HTTP
    const httpRequestMethod = 'POST';
    
    // Construir la cadena a firmar
    const canonicalRequest = 
        `${httpRequestMethod}\n` +
        `${canonicalUri}\n` +
        `${canonicalQueryString}\n` +
        `${canonicalHeaders}\n` +
        `${signedHeaders}\n` +
        `${payloadHash}`;
    
    const credentialScope = `${t.substring(0, 8)}/us-east-1/ProductAdvertisingAPI/aws4_request`;
    const stringToSign = 
        `AWS4-HMAC-SHA256\n` +
        `${t}\n` +
        `${credentialScope}\n` +
        `${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
    
    // Crear la firma
    let kDate = crypto.createHmac('sha256', `AWS4${awsSecretKey}`).update(t.substring(0, 8)).digest();
    let kRegion = crypto.createHmac('sha256', kDate).update('us-east-1').digest();
    let kService = crypto.createHmac('sha256', kRegion).update('ProductAdvertisingAPI').digest();
    let kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    let signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    
    // Devolver los encabezados de autorización
    return {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${awsAccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-date': t,
        'x-amz-content-sha256': payloadHash,
        'content-type': 'application/json'
    };
}

app.get('/api/amazon-book', async (req, res) => {
    const asin = req.query.asin;
    
    if (!asin || asin.length < 10) {
        return res.status(400).json({ 
            error: 'ASIN inválido', 
            message: 'El ASIN debe tener al menos 10 caracteres' 
        });
    }

    try {
        const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const associateTag = process.env.ASSOCIATE_TAG; // ¡Necesitas configurar esto!
        
        if (!awsAccessKey || !awsSecretKey || !associateTag) {
            return res.status(500).json({ 
                error: 'Configuración incompleta', 
                message: 'Faltan credenciales de Amazon' 
            });
        }

        const response = await fetch(`https://webservices.amazon.com${uri}`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Host': host,
        ...authHeaders
    },
    body: JSON.stringify(payload)
});

if (!response.ok) {
    const errorBody = await response.text();
    console.error('Error completo de Amazon:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        url: `https://webservices.amazon.com${uri}`,
        payload: payload,
        headers: authHeaders
    });
    throw new Error(`Error ${response.status} de Amazon API: ${errorBody}`);
}
        
        const data = await response.json();
        
        // Procesar la respuesta
        if (data.ItemsResult && data.ItemsResult.Items && data.ItemsResult.Items.length > 0) {
            const item = data.ItemsResult.Items[0];
            const title = item.ItemInfo?.Title?.DisplayValue || `Book ${asin}`;
            const authors = item.ItemInfo?.ByLineInfo?.Contributors || [];
            const authorNames = authors.map(a => a.Name).join(', ') || 'Unknown Author';
            const coverUrl = item.Images?.Primary?.Large?.URL || 'https://via.placeholder.com/300x450.png?text=Book+Not+Found';
            
            return res.json({
                title: title,
                author: authorNames,
                coverUrl: coverUrl,
                asin: asin
            });
        } else {
            return res.json({
                title: `Book ${asin}`,
                author: 'Unknown Author',
                coverUrl: 'https://via.placeholder.com/300x450.png?text=Book+Not+Found',
                asin: asin
            });
        }
        
    } catch (error) {
        console.error('Error en la API de Amazon:', error);
        res.status(500).json({ 
            error: 'Error al obtener datos del libro',
            details: error.message 
        });
    }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
    console.log(`Servidor backend iniciado en el puerto ${port}`);
});




