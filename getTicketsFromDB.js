require('dotenv').config();
const db = require('./utils/db');
const fs = require('fs').promises; 



async function getTicketContent(ticketId) {
  
    // Adjusted code: Directly use db.query without .promise() 
    if (ticketId) {
      const eventQuery = 'SELECT * FROM ticketevents WHERE ticketId IN (?)';
      const [eventResults] = await db.query(eventQuery, [ticketId.split(',')]);
      return eventResults;
    } 
  
    return [];
}

async function getTicketList(options) {
  if (options.product && options.startDate && options.endDate) {
    const products = options.product.split(',').map(p => p.trim());

    // Construct start and end date strings to cover the entire day in local time
    const startDate = `${options.startDate} 00:00:00`;
    const endDate = `${options.endDate} 23:59:59`;
    const productQuery = 'SELECT DISTINCT ticketId FROM tickets WHERE companyId IN (?) AND createdAt BETWEEN ? AND ?';
    const [ticketResults] = await db.query(productQuery, [products, startDate, endDate]);
    
    console.log(ticketResults.length)
    
    if (ticketResults.length > 330) {
      throw new Error('The number of tickets exceeds the maximum allowed limit of 330. Please adjust your request by narrowing the date range or specifying fewer products to stay within this limit.');
    }
    
    const ticketIds = ticketResults.map(t => t.ticketId.toString());

    return ticketIds;
  } else {
    throw new Error('Invalid arguments provided.');
  }
}

async function structureTicketData(rawTicketData) {
  const excludedEventData = ['10873686477458', '361576897454', '362463859613', '14181031764242']; //Exclude AI integration user, AI-CS integration user, Alan Chatbot, Tempo-ZD Integration user.
  const authorCache = {}; // Cache for userId-Name pairs

  const structuredData = {};
  for (const { ticketId, eventData, eventType, content = '', createdAt } of rawTicketData) {
    if (excludedEventData.includes(eventData) || !eventData) continue;

    if (!structuredData[ticketId]) {
      structuredData[ticketId] = {
        ticketId,
        createdAt,
        lastUpdatedAt: createdAt,
        currentStatus: '',
        currentPriority: '',
        currentProduct: '',
        events: [],
      };
    } else {
      structuredData[ticketId].lastUpdatedAt = createdAt;
    }

    const eventName = {
      '3': 'Status',
      '7': 'Priority',
      '30': 'Macro',
      '15': 'Internal Note',
      '10': 'Public Reply',
      '9': 'Customer Message',
      '31': 'Product',
    }[eventType];

    if (!eventName) continue;

    let authorName = '';
    if (['Internal Note', 'Public Reply', 'Customer Message'].includes(eventName) && eventData) {
      authorName = authorCache[eventData];
      if (!authorName) {
        const userQuery = 'SELECT Name FROM zendeskusers WHERE userId = ?';
        const [userResult] = await db.query(userQuery, [eventData]);
        authorName = userResult[0]?.Name;
        if (authorName) {
          authorCache[eventData] = authorName;
        }
      }
    }

    const cleanedContent = (content || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n/g, ' ')
        .replace(/\\\"/g, '"')
        .replace(/\\\'/g, "'")
        .replace(/\\+/g, '\\')
        .replace(/\s{2,}/g, ' ');

    let eventObject = { eventType: eventName };

    if (['Status', 'Priority', 'Product'].includes(eventName)) {
      eventObject = { ...eventObject, eventData };
    } else {
      eventObject = { ...eventObject, content: cleanedContent };
      if (authorName) eventObject.author = authorName;
    }

    structuredData[ticketId].events.push(eventObject);

    // Update placeholders based on latest event types
    if (eventName === 'Status') {
      structuredData[ticketId].currentStatus = eventData;
    } else if (eventName === 'Priority') {
      structuredData[ticketId].currentPriority = eventData;
    } else if (eventName === 'Product') {
      structuredData[ticketId].currentProduct = eventData;
    }
  }

  return structuredData;
}

async function test() {
    try {
      let result = await getTicketContent('4224336, 4224259');
      result = await structureTicketData(result);
      console.log(result)

      const dataString = JSON.stringify(result, null, 2);

      // Writing to a file
      await fs.writeFile('/tmp/structuredTicketData.json', dataString, 'utf8');
      console.log('Data written to structuredTicketData.json');
      
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

module.exports = { getTicketContent, structureTicketData, getTicketList };
