require('dotenv').config();
const axios = require('axios');
const fs = require('fs/promises');
const { gptApiCall, twoShotGptApiCall, getTokenLength } = require('./gptAnalysis');
const logger = require('./logger');
const { getTicketContent, structureTicketData, getTicketList } = require('./getTicketsFromDB');
const { writeToGoogleSheet } = require('./utils/gsheet');

// Constants
const BATCH_SIZE = 15;
const K_INPUT_TOKEN_PRICE = 0.00015;
const K_OUTPUT_TOKEN_PRICE = 0.0006;

// Global token usage count
let inputTokensTotal = 0;
let outputTokensTotal = 0;


async function getAnalysis(ticketIds, providedTemplate = '') {
    logger.info("Starting Ticket Tamer");

    let template;

    if (providedTemplate) {
        logger.info("Using provided JSON template from the body");
        template = typeof providedTemplate === 'string' ? providedTemplate : JSON.stringify(providedTemplate);
    } else {
        logger.info("Loading existing JSON template from file");
        template = await fs.readFile('./output/json_template.txt', 'utf8');
    }

    logger.info(`${ticketIds.length} tickets queued for analysis`);

    // Initialize a list to hold all ticket JSONs
    let ticketJsons = [];

    // Iterate over all tickets in batches
    logger.info("Analyzing tickets");
    for (let i = 0; i < ticketIds.length; i += BATCH_SIZE) {
        const batch = ticketIds.slice(i, i + BATCH_SIZE);
        logger.info(`Processing batch: ${i + 1} to ${Math.min(i + BATCH_SIZE, ticketIds.length)} out of ${ticketIds.length} tickets`);

        // Create a promise for each ticket analysis within the current batch
        const batchPromises = batch.map(ticketId => analyzeTicket(template, ticketId).catch(error => {
            logger.error(`Error processing ticket ID ${ticketId}: ${error}`);
            return { error: true, ticketId, message: `Error processing ticket ID ${ticketId}: ${error.message}` };
        }));

        // Wait for all promises in the batch to resolve
        const batchResults = await Promise.all(batchPromises);
        ticketJsons.push(...batchResults); // Add results to the aggregate array

        logger.info(`Completed processing batch: ${i + 1} to ${Math.min(i + BATCH_SIZE, ticketIds.length)} tickets`);
    }
    
    logger.info(`Input tokens: ${inputTokensTotal}`);
    logger.info(`Output tokens: ${outputTokensTotal}`);
    logger.info(`Total cost: ${(inputTokensTotal / 1000 * K_INPUT_TOKEN_PRICE + outputTokensTotal / 1000 * K_OUTPUT_TOKEN_PRICE).toFixed(2)} USD`);
    
    return ticketJsons;
}

async function getJsonTemplate(problemDescription) {
    logger.info("Getting JSON template");

    // Load prompts from files
    const prompt1 = await fs.readFile('./prompts/get_json_template_1.txt', 'utf8');
    const prompt2 = await fs.readFile('./prompts/get_json_template_2.txt', 'utf8');
    const prompt3 = await fs.readFile('./prompts/get_json_template_3.txt', 'utf8');

    

    // Call GPT
    const [inputTokenLength, gptAnalysis, statusCode] = await twoShotGptApiCall(prompt1, [prompt2, prompt3, problemDescription], "json");

    // Add input tokens to total
    inputTokensTotal += inputTokenLength;

    // Check if the call was successful
    
    if (statusCode !== 200) {
        throw new Error(`GPT API call failed with status code: ${statusCode}`);
    }

    console.log(gptAnalysis)
    // Write gptAnalysis to file
    //await fs.writeFile('./json_template.txt', gptAnalysis);

    logger.info("JSON template created");

    return gptAnalysis;
}

async function analyzeTicket(template, ticketId) {
    logger.info(`Analyzing ticket ${ticketId}`);
    let inputTokenLength = 0;
    let outputTokenLength = 0;

    try {
        const prompt = await fs.readFile('./prompts/analyze_ticket.txt', 'utf8');
        const formattedPrompt = prompt.replace('{{JSON_TEMPLATE}}', template);
        
        let rawTicketData = await getTicketContent(ticketId);
        let ticketContentStructure = await structureTicketData(rawTicketData);
        const ticketDetails = ticketContentStructure[ticketId];
        
        // Assuming getTicketContent now returns structured ticket data compatible with gptApiCall
        const [gptInputTokenLength, gptAnalysis, statusCode] = await gptApiCall(formattedPrompt, JSON.stringify(ticketContentStructure), "json");

        inputTokenLength += gptInputTokenLength;
        outputTokenLength = getTokenLength(gptAnalysis);

        if (statusCode === 200) {
            logger.info(`GPT analysis for ticket ${ticketId} completed`);
            let analysisResult = JSON.parse(gptAnalysis); // Assuming the API response is a JSON string
            analysisResult = {
                ...analysisResult,
                "ticket_id": {"value": ticketId},
                "url": {"value": `https://${process.env.ZD_SUBDOMAIN}.zendesk.com/agent/tickets/${ticketId}`},
                "createdAt": {"value": ticketDetails.createdAt},
                "lastUpdatedAt": {"value": ticketDetails.lastUpdatedAt},
                "Status": {"value": ticketDetails.currentStatus},
                "Priority": {"value": ticketDetails.currentPriority},
                "Product": {"value": ticketDetails.currentProduct},
            };
        
            
            return analysisResult; 
        } else {
            logger.info(`Error getting GPT analysis for ticket ${ticketId}`);
            return {
                "ticket_id": {"value": ticketId},
                "notes": "Error getting GPT analysis",
                "url": `https://${process.env.ZD_SUBDOMAIN}.zendesk.com/agent/tickets/${ticketId}`
            };
        }
    } catch (error) {
        logger.info(`Error analyzing ticket ${ticketId}: ${error}`);
        return {
            "ticket_id": {"value": ticketId},
            "notes": "Exception triggered while getting ticket analysis",
            "url": `https://${process.env.ZD_SUBDOMAIN}.zendesk.com/agent/tickets/${ticketId}`
        };
    } finally {
        // Update global token counts
        inputTokensTotal += inputTokenLength;
        outputTokensTotal += outputTokenLength;
    }
}


exports.handler = async (event) => {
    
    const authorizationHeader = event.headers.Authorization || event.headers.authorization;
    const expectedAuthKey = process.env.AUTH_KEY;

    if (!authorizationHeader || authorizationHeader !== expectedAuthKey) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: "Unauthorized access" }),
        };
    }
    
    
  const queryParams = event.queryStringParameters;
  const body = event.body ? JSON.parse(event.body) : {};

  console.log(queryParams);
  console.log(body);

  const useCustomTemplate = queryParams.useTemplate === "true";
  
  try {
    if (queryParams.product && queryParams.startDate && queryParams.endDate) {
      // Case for analyzing tickets by product and date range
      console.log(`Analyzing tickets by product and date range with ${useCustomTemplate ? "a new JSON template from the body" : "the existing JSON template"}`);
      const options = {
        product: queryParams.product,
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
        sheetId: queryParams.sheetId
      };
      
      // Get ticket list using options
      let ticketList = await getTicketList(options);
      
      console.log(ticketList);
      
      // Run analysis with the ticketIds from the ticketList
      const ticketJsons = await getAnalysis(ticketList, useCustomTemplate ? body.template : '');
      
      await writeToGoogleSheet(ticketJsons, options.sheetId);
      
    } else if (queryParams.ticketIds) {
      // Case for analyzing specific tickets by ID
      console.log(`Analyzing specific tickets by ticket ID with ${useCustomTemplate ? "a new JSON template from the body" : "the existing JSON template"}`);
      const ticketIds = queryParams.ticketIds.split(','); // Assuming ticketIds are passed as a comma-separated string
      console.log(ticketIds);
      
      // Perform analysis on specific ticket IDs with the appropriate template
      const ticketJsons = await getAnalysis(ticketIds, useCustomTemplate ? body.template : '');
      
      // Write results to Google Sheet if sheetId is provided
      if (queryParams.sheetId) {
        await writeToGoogleSheet(ticketJsons, queryParams.sheetId);
      }
    } else {
      // Error handling for invalid input
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid request. Please provide ticketIds or product with startDate and endDate." }),
      };
    }
    
    const response = {
      statusCode: 200,
      body: JSON.stringify({ message: "Analysis completed successfully and posted to spreadsheet." }),
    };
    return response;
  } catch (e) {
    console.log(`Error found! ${e}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: `Internal server error: ${e.message}` }),
    };
  }
};
