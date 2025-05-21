import mqtt from "mqtt";
import * as marketdata from "../proto/market_data_pb";
import { subscribeToAtmOptions } from "./subscriptionManager";
import { getAtmStrike } from "../utils";
import { saveToDatabase } from "../db";

// Store LTP values for indices
const indexLtpMap = new Map<string, number>();
const atmStrikeMap = new Map<string, number>();
const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];

export function processMessage(
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
      if (indices.some((index) => topic.includes(index))) {
        const parts = topic.split("/");
        indexName = parts[1];
        const prevLtp = indexLtpMap.get(indexName);
        // Optimize our tasks
        if (prevLtp !== ltp) {
          indexLtpMap.set(indexName, ltp);
          const prevAtm = atmStrikeMap.get(indexName);
          // To avoid redundent subscriptions
          currentAtm = getAtmStrike(indexName, ltp);
          if (prevAtm !== currentAtm) {
            atmStrikeMap.set(indexName, currentAtm);
            subscribeToAtmOptions(client, indexName, currentAtm);
          }
        }
      }

      // 4. Save data to database
      saveToDatabase(topic, ltp, indexName, undefined, currentAtm);
    }
  } catch (error) {
    console.error("Error processing message:", error);
  }
}
