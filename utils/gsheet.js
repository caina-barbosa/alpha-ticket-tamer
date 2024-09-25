require('dotenv').config();
const fs = require('fs/promises');
const { JWT } = require('google-auth-library');
const { GoogleSpreadsheet } = require('google-spreadsheet');

async function writeToGoogleSheet(jsonData, sheetId = '1t6gTa-zeVZiL4CJTpH-TvcHY6nweMT-ZUM15zv0EL98') {
    const auth = new JWT({
        email: process.env.CLIENT_EMAIL,
        key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();

    const sheetTitle = `Analysis_${new Date().toISOString().replace(/:/g, '-')}`;
    // Determine unique headers from jsonData
    const uniqueHeaders = new Set();
    jsonData.forEach(entry => Object.keys(entry).forEach(key => uniqueHeaders.add(key)));
    const headerValues = Array.from(uniqueHeaders); // Convert Set to Array

    // Create a new sheet with dynamic headers
    await doc.addSheet({ title: sheetTitle, headerValues: headerValues });
    const sheet = doc.sheetsByTitle[sheetTitle]; // Retrieve the newly created sheet


    // Map jsonData to rows
    const rows = jsonData.map(entry => {
        const row = {};
        headerValues.forEach(header => {
            // Check if entry[header] is defined and is an object
            if (entry[header] && typeof entry[header] === 'object') {
                // Special handling for Date objects encapsulated within the 'value' property
                if (entry[header].value instanceof Date) {
                    // Convert Date objects to ISO string format
                    row[header] = entry[header].value.toISOString();
                } else {
                    // For non-Date objects, proceed as before
                    const value = entry[header].value;
                    row[header] = typeof value === 'string' ? value.trim() : value;
                }
            } else {
                // If entry[header] is not an object, directly assign an empty string (fallback)
                row[header] = '';
            }
        });
        return row;
    });


    // Add rows to the sheet
    console.log(rows);
    await sheet.addRows(rows);
}

async function test (){

const gptAnalysisData = await fs.readFile('./gptAnalysisData.json', 'utf8').then(JSON.parse);

await writeToGoogleSheet(gptAnalysisData)

}

module.exports = { writeToGoogleSheet };