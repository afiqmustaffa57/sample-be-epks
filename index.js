const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require("path");
const { PrismaClient } = require('@prisma/client');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const ExcelJS = require('exceljs');
const Papa = require('papaparse');
const prisma = new PrismaClient();
const app = express();

// Use the cors middleware and enable for all origins
app.use('/uploads', express.static('uploads'));
app.use(cors());
app.use(express.json());

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Express API with Swagger',
            version: '1.0.0',
            description: 'A simple Express API with Prisma and PostgreSQL'
        },
        servers: [
            {
                url: 'http://localhost:3000',
            },
        ],
    },
    apis: ['./index.js'],
};

const specs = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

/**
 * @swagger
 * components:
 *   schemas:
 *     Exam:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - venue
 *         - time
 *         - duration
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the exam
 *         name:
 *           type: string
 *           description: The name of the exam
 *         description:
 *           type: string
 *           description: The description of the exam
 *         venue:
 *           type: string
 *           description: The venue of the exam
 *         time:
 *           type: string
 *           format: date-time
 *           description: The time of the exam
 *         duration:
 *           type: integer
 *           description: The duration of the exam in minutes
 *     PaginatedExams:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Exam'
 *         meta:
 *           type: object
 *           properties:
 *             totalRecords:
 *               type: integer
 *             totalPages:
 *               type: integer
 *             currentPage:
 *               type: integer
 *
 * /exams:
 *   get:
 *     summary: Returns a list of exams with pagination and filtering
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: The page number to retrieve. Defaults to 1.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: The number of records per page. Defaults to 10.
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *         description: The field name you want to filter on (e.g., "name", "description", "venue").
 *     responses:
 *       200:
 *         description: A paginated list of exams with filtering options
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedExams'
 */
app.get('/exams', async (req, res) => {
    try {
        const { page = 1, limit = 10, filter } = req.query;

        const pageNumber = Number(page);
        const pageSize = Number(limit);
        const skip = (pageNumber - 1) * pageSize;

        let whereClause = {};

        if (filter) {
            const filters = [
                { name: { contains: filter, mode: 'insensitive' } },
                { description: { contains: filter, mode: 'insensitive' } },
                { venue: { contains: filter, mode: 'insensitive' } }
                // Add other fields as needed
            ];

            const examMatches = await prisma.exam.findMany({
                where: {
                    OR: filters
                }
            });

            // If matches are found, collect their IDs to target those specific records.
            if (examMatches && examMatches.length > 0) {
                whereClause.id = {
                    in: examMatches.map(exam => exam.id)
                };
            } else {
                // If no matches found, then set an impossible condition to return an empty array
                whereClause.id = -1;
            }
        }

        const exams = await prisma.exam.findMany({
            skip: skip,
            take: pageSize,
            where: whereClause
        });

        const totalExams = await prisma.exam.count({
            where: whereClause
        });

        res.json({
            items: exams,
            meta: {
                totalRecords: totalExams,
                totalPages: Math.ceil(totalExams / pageSize),
                currentPage: pageNumber
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * @swagger
 * /export/exams:
 *   get:
 *     summary: Export exams to Excel
 *     description: Exports all exam records, optionally filtered by query parameters, as an Excel file.
 *     produces:
 *       - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *     parameters:
 *       - name: filter
 *         in: query
 *         description: Optional filter to narrow down exams by name, description, or venue.
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Internal server error
 */

app.get('/export/exams', async (req, res) => {
    try {
        const { filter } = req.query;

        let whereClause = {};

        if (filter) {
            const filters = [
                { name: { contains: filter, mode: 'insensitive' } },
                { description: { contains: filter, mode: 'insensitive' } },
                { venue: { contains: filter, mode: 'insensitive' } }
            ];

            const examMatches = await prisma.exam.findMany({
                where: {
                    OR: filters
                }
            });

            if (examMatches && examMatches.length > 0) {
                whereClause.id = {
                    in: examMatches.map(exam => exam.id)
                };
            } else {
                whereClause.id = -1;
            }
        }

        const exams = await prisma.exam.findMany({
            where: whereClause
        });

        // Create workbook & add worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Exams');

        // Define columns in the worksheet
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Description', key: 'description', width: 30 },
            { header: 'Venue', key: 'venue', width: 20 }
            // Add other fields as needed
        ];

        // Add data to the worksheet
        worksheet.addRows(exams);

        // Set up Excel download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=exams.xlsx');

        // Write the Excel file response
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * @swagger
 * /export/exams/csv:
 *   get:
 *     summary: Export exams to CSV
 *     description: Exports all exam records, optionally filtered by query parameters, as a CSV file.
 *     produces:
 *       - text/csv
 *     parameters:
 *       - name: filter
 *         in: query
 *         description: Optional filter to narrow down exams by name, description, or venue.
 *         required: false
 *         type: string
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Internal server error
 */
app.get('/export/exams/csv', async (req, res) => {
    try {
        const { filter } = req.query;

        let whereClause = {};

        if (filter) {
            const filters = [
                { name: { contains: filter, mode: 'insensitive' } },
                { description: { contains: filter, mode: 'insensitive' } },
                { venue: { contains: filter, mode: 'insensitive' } }
                // Add other fields as needed
            ];

            whereClause = {
                OR: filters
            };
        }

        const exams = await prisma.exam.findMany({
            where: whereClause
        });

        const csv = Papa.unparse(exams);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=exams.csv');
        res.status(200).send(csv);

    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

/**
 * @swagger
 * /exams:
 *   post:
 *     summary: Create a new exam
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Exam'
 *     responses:
 *       200:
 *         description: The created exam
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Exam'
 */

// Create a new exam
app.post('/exams', async (req, res) => {
    try {
        const exam = await prisma.exam.create({
            data: req.body
        });
        res.json(exam);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /exam/{id}:
 *   delete:
 *     summary: Delete an exam by ID
 *     description: Endpoint to delete an exam.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the exam to delete.
 *     responses:
 *       200:
 *         description: Successfully deleted exam.
 *       400:
 *         description: Invalid input.
 *       404:
 *         description: Exam not found.
 *       500:
 *         description: Internal server error.
 */


app.delete('/exam/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const examToDelete = await prisma.exam.findUnique({ where: { id: parseInt(id, 10) } });

        if (!examToDelete) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        await prisma.exam.delete({ where: { id: parseInt(id, 10) } });

        return res.status(200).json({ message: 'Exam deleted successfully' });

    } catch (error) {
        console.error('Error deleting exam:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


// Define storage and naming for uploaded images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));  // Using an absolute path
    },
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname);
        const fileName = `${file.originalname.replace(fileExt, "")}-${Date.now()}${fileExt}`;
        cb(null, fileName);
    },
})
const upload = multer({ storage: storage });

// Endpoint for image upload
app.post("/upload-image", upload.single("image"), (req, res) => {
    if (req.file) {
        // If the upload is successful, send the file's URL as the response
        res.status(200).json({
            url: `http://localhost:3000/uploads/${req.file.filename}`,
        });
    } else {
        res.status(400).send("Upload failed");
    }
});

app.get("/admin", async (req, res) => {
    let resp = await getAccessToken();
    console.log(resp)
    let registerResp = await registerUser(resp.data.access_token)
    res.status(200).json(registerResp);
});

const registerUser = async (token) => {
    const axios = require('axios');
    let data = JSON.stringify({
        "enabled": true,
        "username": "gg",
        "email": "test@example.com",
        "attributes": {
            "nokp": "951230146065",
            "nama": "",
            "phone": ""
        },
        "credentials": [
            {
                "type": "password",
                "value": "ff",
                "temporary": false
            }
        ]
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://keycloak.cloud-connect.asia/admin/realms/Dagobah/users',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        data: data
    };

    return await axios.request(config)
}


const getAccessToken = async () => {
    const axios = require('axios');
    const qs = require('qs');
    let data = qs.stringify({
        'grant_type': 'password',
        'client_id': 'admin-cli',
        'username': 'admin',
        'password': 'admin',
        'client_secret': 'mISqg2mjLOxZA9ku3JgYr7yqiI5HCNqb'
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://keycloak.cloud-connect.asia/realms/master/protocol/openid-connect/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data
    };

    return await axios.request(config)

}



/**
 * @swagger
 * /question:
 *   post:
 *     summary: Create a new question
 *     description: Add a new question to the database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: "object"
 *             properties:
 *               title:
 *                 type: "string"
 *               content:
 *                 type: "string"
 *               answer:
 *                 type: "array"
 *                 items:
 *                   type: "object"
 *                   properties:
 *                     name:
 *                       type: "string"
 *                     content:
 *                       type: "string"
 *               correctAnswer:
 *                 type: "string"
 *     responses:
 *       201:
 *         description: Successfully created question.
 *       400:
 *         description: Invalid input.
 *       500:
 *         description: Internal server error.
 */
app.post('/question', async (req, res) => {
    try {
        const { title, content, answer, correctAnswer } = req.body;

        // Validation: Check if answer has the correct structure
        if (!Array.isArray(answer) || answer.length !== 4) {
            return res.status(400).json({ error: "Answer array is not in the expected format." });
        }

        for (let option of answer) {
            if (!option.name || !option.content) {
                return res.status(400).json({ error: "Answer options are not in the expected format." });
            }
        }

        const newQuestion = await prisma.question.create({
            data: {
                title,
                content,
                answer,
                correctAnswer
            }
        });

        res.status(201).json(newQuestion);

    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});