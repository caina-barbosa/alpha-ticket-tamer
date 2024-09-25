const axios = require('axios');
const fs = require('fs/promises');
const logger = require('./logger');
const { encoding_for_model } = require('tiktoken');



// GPT constants.
const aiModel = "gpt-4o-mini";  // "gpt-4"
const modelTokens = 32768;  // 8192
const modelTemperature = 0;
const resultTokenLength = 3072;
const promptTokenLength = 1536;
const keyEnvName = process.env.OPENAI_TRILOGY_KEY;


//GPT API Call
async function gptApiCall(prompt, data, format = null) {
    

    const gptInput = [
        { "role": "system", "content": prompt },
        { "role": "user", "content": data }
    ];

    try {
        const client = axios.create({
            baseURL: 'https://api.openai.com/v1/',
            headers: { 'Authorization': `Bearer ${keyEnvName}` }
        });

        

        let params = {
            model: aiModel,
            messages: gptInput,
            temperature: modelTemperature,
            max_tokens: resultTokenLength,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        };

        // Include response_format if format is "json"
        if (format === "json") {

            params = {
                ...params,
                response_format: { type: "json_object" }
            };
        }

        const response = await client.post('chat/completions', params);
        const gptAnalysis = response.data.choices[0].message.content;
        const inputTokenLength = getTokenLength(prompt) + getTokenLength(data);

        return [inputTokenLength, gptAnalysis, 200];
    } catch (error) {
        logger.error(`Error getting GPT analysis: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        return [0, `Error getting GPT analysis: ${error.message}`, 500];
    }
}

//Two Shot GPT API Call
async function twoShotGptApiCall(prompt, data, format = null) {
    logger.info("Calling GPT");

    let gptInput = [{ "role": "system", "content": prompt }];
    

    data.forEach((entry, index) => {
        const role = index % 2 === 0 ? "user" : "system";
        gptInput.push({ "role": role, "content": entry });
    });

    // Check if the last input is from 'user'
    const lastInput = gptInput[gptInput.length - 1];
    logger.info(`Last input: ${JSON.stringify(lastInput)}`);
    
    if (lastInput.role !== "user") {
        logger.info("Error building GPT input: Last input was not user");
        return [0, "Error building GPT input: Last input was not user", 500];
    }

    try {
        const client = axios.create({
            baseURL: 'https://api.openai.com/v1/',
            headers: { 'Authorization': `Bearer ${keyEnvName}` }
        });

        logger.info("Getting GPT analysis");

        const params = {
            model: aiModel,
            messages: gptInput,
            temperature: modelTemperature,
            max_tokens: resultTokenLength,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            response_format: format === "json" ? { type: "json_object" } : undefined
        };

        const response = await client.post('chat/completions', params);
        const gptAnalysis = response.data.choices[0].message.content;
        let inputTokenLength = getTokenLength(prompt);
        data.forEach(entry => {
            inputTokenLength += getTokenLength(entry);
        });

        return [inputTokenLength, gptAnalysis, 200];
    } catch (error) {
        logger.error(`Error getting GPT analysis: ${error}`);
        return [0, `Error getting GPT analysis: ${error.message}`, 500];
    }
}

module.exports = {
    gptApiCall,
    twoShotGptApiCall,
    getTokenLength
};


//Token Count Helper functions

function getTokenLength(text) {
    const encoding = encoding_for_model("gpt-4");
    const currentTokens = Array.from(encoding.encode(text));
    const tokenLength = currentTokens.length;
    encoding.free(); 
    return tokenLength;
}

function trimTextToTokenCount(text, maxTokens, removeEnd = true) {
    const encoding = encoding_for_model("gpt-4");
    const currentTokens = Array.from(encoding.encode(text));

    if (currentTokens.length <= maxTokens) {
        logger.info(`Length of current tokens is ${currentTokens.length} which is less than max tokens ${maxTokens}. Returning text as is.`);
        encoding.free();
        return text;
    }

    let trimmedTokens;
    if (removeEnd) {
        logger.info(`Length of current tokens is ${currentTokens.length} which is more than max tokens ${maxTokens}. Trimming from the end.`);
        trimmedTokens = currentTokens.slice(0, maxTokens);
    } else {
        logger.info(`Length of current tokens is ${currentTokens.length} which is more than max tokens ${maxTokens}. Trimming from the beginning.`);
        trimmedTokens = currentTokens.slice(-maxTokens);
    }
    const trimmedText = new TextDecoder().decode(encoding.decode(trimmedTokens));
    encoding.free();
    return trimmedText;
}