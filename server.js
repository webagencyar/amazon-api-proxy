require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const cors = require('cors');
const app = express();

app.use(cors());

// Función para generar el encabezado de autorización
function generateAuthorizationHeader(payload, host, uri, awsAccessKey, awsSecretKey, associateTag) {
    const t = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    
    const parameters = {
        'Action': 'GetItems',
        'PartnerTag': associateTag,
        'PartnerType': 'Associates',
        'ItemIds': payload.ItemIds[0],
        'Resources': 'ItemInfo.Title,ItemInfo.ByLineInfo,Images.Primary.Large'
    };
    
    // Crear la cadena de consulta
    const queryString = new URLSearchParams(parameters).toString();
    
    // Crear la firma
    const stringToSign = `POST\n${uri}\n\nhost:${host}\nx-amz-date:${t}\n\nhost;x-amz-date\n${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
    
    const dateKey = crypto.createHmac('sha256', `AWS4${awsSecretKey}`, { encoding: 'utf8' }).update(t.substring(0, 8)).digest();
    const regionKey = crypto.createHmac('sha256', dateKey, { encoding: 'utf8' }).update('us-east-1').digest();
    const serviceKey = crypto.createHmac('sha256', regionKey, { encoding: 'utf8' }).update('ProductAdvertisingAPI').digest();
    const signingKey = crypto.createHmac('sha256', serviceKey, { encoding: 'utf8' }).update('aws4_request').digest();
    
    const signature = crypto.createHmac('sha256', signingKey, { encoding: 'utf8' })
        .update(stringToSign)
        .digest('hex');
    
    return {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${awsAccessKey}/${t.substring(0, 8)}/us-east-1/ProductAdvertisingAPI/aws4_request, SignedHeaders=host;x-amz-date, Signature=${signature}`,
        'x-amz-date': t,
        'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems'
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

        const host = 'webservices.amazon.com';
        const uri = '/paapi5/getitems';
        
        // Cuerpo de la solicitud
        const payload = {
            "ItemIds": [asin],
            "Resources": [
                "ItemInfo.Title",
                "ItemInfo.ByLineInfo",
                "Images.Primary.Large"
            ],
            "PartnerTag": associateTag,
            "PartnerType": "Associates"
        };

        // Generar encabezados de autorización
        const authHeaders = generateAuthorizationHeader(
            payload, 
            host, 
            uri, 
            awsAccessKey, 
            awsSecretKey,
            associateTag
        );

        // Realizar la solicitud
        const response = await fetch(`https://${host}${uri}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Host': host,
                ...authHeaders
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            // Obtener el cuerpo del error para más detalles
            const errorBody = await response.text();
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
