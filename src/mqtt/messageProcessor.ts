import mqtt from "mqtt";
import * as marketdata from "../proto/market_data_pb";
import {
  optionTopicMapping,
  subscribeToAtmOptions,
} from "./subscriptionManager";
import { getAtmStrike, getOptionTopic } from "../utils";
import { saveToDatabase } from "../db";
import { INDICES } from "../config";

// Store LTP values for indices
const indexLtpMap = new Map<string, number>();
const atmStrikeMap = new Map<string, number>();
const indicesOptionsDone = new Map<string, boolean>();

export async function processMessage(
  topic: string,
  message: Buffer,
  client: mqtt.MqttClient
) {
  try {
    // TODO: Implement this function
    // 1. Parse the message (it's likely in JSON format)
    // 2. Extract LTP value
    // 3. If it's an index topic, calculate ATM and subscribe to options (This is one time operation only)
    // Decoding logic
    let decoded: any = null;
    let ltpValues: number[] = [];

    // Try decoding as MarketData
    try {
      decoded = marketdata.marketdata.MarketData.decode(
        new Uint8Array(message)
      );
      if (decoded && typeof decoded.ltp === "number") {
        ltpValues.push(decoded.ltp);
      }
    } catch (err) {
      // Try decoding as MarketDataBatch
      try {
        decoded = marketdata.marketdata.MarketDataBatch.decode(
          new Uint8Array(message)
        );
        if (decoded && Array.isArray(decoded.data)) {
          ltpValues = decoded.data
            .map((d: any) => d.ltp)
            .filter((v: any) => typeof v === "number");
        }
      } catch (batchErr) {
        // Try decoding as JSON
        try {
          decoded = JSON.parse(message.toString());
          if (decoded && typeof decoded.ltp === "number") {
            ltpValues.push(decoded.ltp);
          }
        } catch (jsonErr) {
          console.error(
            "Failed to decode message as protobuf or JSON for topic:",
            topic
          );
        }
      }
    }

    // ltpValues now contains the decoded LTP values
    for (const ltp of ltpValues) {
      // Process the LTP value
      let indexName = undefined,
        currentAtm = undefined;
      const parts = topic.split("/");
      indexName = parts[1];
      if (
        indicesOptionsDone.has(indexName) === false &&
        INDICES.includes(indexName)
      ) {
        const prevLtp = indexLtpMap.get(indexName);
        indicesOptionsDone.set(indexName, true);
        // Optimize our tasks
        if (prevLtp !== ltp) {
          indexLtpMap.set(indexName, ltp);
          const prevAtm = atmStrikeMap.get(indexName);
          // To avoid redundent subscriptions
          currentAtm = getAtmStrike(indexName, ltp);
          if (prevAtm !== currentAtm) {
            atmStrikeMap.set(indexName, currentAtm);
            console.log("Subscribing");
            await subscribeToAtmOptions(client, indexName, currentAtm);
          }
        }
        await saveToDatabase(topic, ltp, indexName, undefined, currentAtm);
      }
      else
      // 4. Save data to database
      {
        await saveToDatabase(
          topic,
          ltp,
          optionTopicMapping.get(topic)?.indexName,
          optionTopicMapping.get(topic)?.type,
          optionTopicMapping.get(topic)?.strike,
        );
      }
    }
  } catch (error) {
    console.error("Error processing message:", error);
  }
}
