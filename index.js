const { SessionsClient } = require('@google-cloud/dialogflow');
const twilio = require('twilio');

/**
 * Handle incoming WhatsApp messages and process through Dialogflow
 * @param {Object} context - Twilio Function context
 * @param {Object} event - Incoming event details
 * @param {Function} callback - Callback function
 */
exports.handler = async function(context, event, callback) {
  // Initialize Twilio MessagingResponse
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    // Extract message details
    const { Body: receivedMsg, From: userNumber } = event;

    if (!receivedMsg) {
      throw new Error('No message received');
    }

    // Configure Dialogflow client
    const dialogflowClient = new SessionsClient({
      keyFilename: Runtime.getAssets()['/dialogflow-credentials.json'].path
    });

    const projectId = process.env.DIALOGFLOW_PROJECT_ID || 
      (() => { throw new Error('Dialogflow Project ID not configured'); })();
    const languageCode = process.env.LANGUAGE_CODE || 'en-US';

    // Create unique session path for user
    const sessionPath = dialogflowClient.projectAgentSessionPath(
      projectId, 
      userNumber
    );

    // Prepare Dialogflow request
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: receivedMsg,
          languageCode
        }
      }
    };

    // Detect intent from Dialogflow
    const [response] = await dialogflowClient.detectIntent(request);
    const { fulfillmentMessages } = response.queryResult;

    await processDialogflowResponses(fulfillmentMessages, twiml);
    return callback(null, twiml);

  } catch (error) {
    console.error('Dialogflow WhatsApp Integration Error:', error);
    twiml.message('Sorry, there was an error processing your request.');
    
    return callback(error, twiml);
  }
};

/**
 * Process Dialogflow fulfillment messages
 * @param {Array} messages - Fulfillment messages from Dialogflow
 * @param {Object} twiml - Twilio MessagingResponse object
 */
async function processDialogflowResponses(messages, twiml) {
  for (const message of messages) {
    // Handle text responses
    if (message.text) {
      const textResponse = message.text.text[0];
      twiml.message(textResponse);
    }

    // Handle custom payloads
    if (message.payload) {
      const { fields } = message.payload;
      const payloadMessage = twiml.message();

      // Handle media URL
      if (fields.mediaUrl) {
        const mediaUrl = fields.mediaUrl.stringValue;
        payloadMessage.media(mediaUrl);
      }

      // Handle additional text
      if (fields.text) {
        const text = fields.text.stringValue;
        payloadMessage.body(text);
      }
    }
  }
}
