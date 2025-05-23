import mqtt from "mqtt";
import { config, INDICES, EXPIRY_DATES, STRIKE_RANGE } from "../config";
import * as utils from "../utils";

interface optionTopicData {
  indexName: string;
  type: string;
  strike: number;
}

// Set of active subscriptions to avoid duplicates
export const activeSubscriptions = new Set<string>();

// Track if we've received the first message for each index
export const isFirstIndexMessage = new Map<string, boolean>();

// To map type for option be it CE and PE
const CEToken = new Map<number, string>();
const PEToken = new Map<number, string>();
export const optionTopicMapping = new Map<string, optionTopicData>();

// Subscribe to all index topics
export function subscribeToAllIndices(client: mqtt.MqttClient) {
  INDICES.forEach((indexName) => {
    const topic = `${config.app.indexPrefix}/${indexName}`;
    client.subscribe(topic);
    activeSubscriptions.add(topic);
  });
}

// Initialize first message tracking
export function initializeFirstMessageTracking() {
  INDICES.forEach((indexName) => {
    isFirstIndexMessage.set(indexName, true);
  });
}

// Subscribe to options around ATM strike
export async function subscribeToAtmOptions(
  client: mqtt.MqttClient,
  indexName: string,
  atmStrike: number
) {
  // TODO: Implement this function
  // 1. Calculate strike prices around ATM
  // 2. For each strike, get option tokens for CE and PE
  // 3. Subscribe to corresponding topics
  const strikeDiff = utils.getStrikeDiff(indexName);
  const strikes = [];

  for (let i = -STRIKE_RANGE; i <= STRIKE_RANGE; i++) {
    strikes.push(atmStrike + i * strikeDiff);
  }

  // TODO: Subscribe to options
  for (const strike of strikes) {
    if (strike <= 0) continue; // ignore invalid strikes

    // Fetch tokens for CE and PE
    let ceToken, peToken;
    if (!CEToken.has(strike))
      ceToken = await getOptionToken(indexName, strike, "ce");
    else
      ceToken = CEToken.get(strike);
    if (!PEToken.has(strike))
      peToken = await getOptionToken(indexName, strike, "pe");
    else
      peToken = PEToken.get(strike);

    // Avoiding redundancy
    let CEOptionTopic = utils.getOptionTopic(indexName, ceToken!);
    if (ceToken && !activeSubscriptions.has(CEOptionTopic)) {
      client.subscribe(CEOptionTopic, (err) => {
        if (err) {
          console.error(
            `Failed to subscribe to CE option token ${ceToken} and indexName ${indexName}`,
            err
          );
        } else {
          activeSubscriptions.add(CEOptionTopic);
          optionTopicMapping.set(CEOptionTopic, {
            indexName: indexName,
            type: "CE",
            strike: strike
          });
          console.log(`Added ${CEOptionTopic} for CE`)
        }
      });
    }
    // Avoiding redundancy
    let PEOptionTopic = utils.getOptionTopic(indexName, peToken!);
    if (peToken && !activeSubscriptions.has(PEOptionTopic)) {
      client.subscribe(utils.getOptionTopic(indexName, peToken), (err) => {
        if (err) {
          console.error(
            `Failed to subscribe to PE option token ${peToken}`,
            err
          );
        } else {
          activeSubscriptions.add(PEOptionTopic);
          optionTopicMapping.set(PEOptionTopic, {
            indexName: indexName,
            type: "PE",
            strike: strike
          });
          console.log(`Added ${PEOptionTopic} for PE`)
        }
      });
    }
  }
}

// Fetch option token from API
export async function getOptionToken(
  indexName: string,
  strikePrice: number,
  optionType: "ce" | "pe"
): Promise<string | null> {
  try {
    // TODO: Implement this function
    // 1. Make API call to get token
    // 2. Return the token

    const expiryDate = EXPIRY_DATES[indexName as keyof typeof EXPIRY_DATES];
    const url = `https://api.trado.trade/token?index=${indexName}&expiryDate=${expiryDate}&optionType=${optionType}&strikePrice=${strikePrice}`;

    // TODO: Fetch from API and return token
    const response = await fetch(url);
    if (!response.ok) {
      console.log("Error while fetching from api");
      return null;
    }
    const data = await response.json();
    if (data.data.token) return data.data.token;
    else {
      console.error(
        `Token not found in API response for ${indexName} ${strikePrice} ${optionType}`
      );
      return null;
    }
  } catch (error) {
    console.error(
      `Error fetching token for ${indexName} ${strikePrice} ${optionType}:`,
      error
    );
    return null;
  }
}
