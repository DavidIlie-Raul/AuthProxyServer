import express, { response } from "express";
import { MongoClient, ServerApiVersion } from "mongodb";
import axios from "axios";
import dotenv from "dotenv";
import bodyParser from "body-parser";
dotenv.config();

const uri = `mongodb+srv://${process.env.mongouser}:${process.env.mongopass}@mailcluster.xowmhmr.mongodb.net/?retryWrites=true&w=majority`;
const listmonkURL = "http://peacefulriches.com:9000/api/subscribers";

let responseToSendBackFromEndpoint;
const app = express();
const client = new MongoClient(uri);
const PORT = process.env.PORT;
const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
app.use(bodyParser.json()); // for parsing application/json

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    sendErrorToWebHook(
      "Error connecting to MongoDB when Proxy Server started!: " + error
    );
  }
}

// Call the function to connect
connectToMongoDB();

const db = client.db("maildb");

//Endpoint to receive ListMonk Data
app.post("/maildata", async (req, res) => {
  if (req.body.email && req.body.status) {
    const receivedEmail = req.body.email;
    const receivedStatus = req.body.status;
    const receivedLists = req.body?.lists;

    //compare received email from client to see if it is valid
    console.log("checking if email is valid ...");
    if (emailPattern.test(receivedEmail)) {
      console.log("Email matches regex pattern, thus it is valid");
    } else {
      res.send({ response_message: "Invalid Email" });
      return console.log(
        "Email does not match regex pattern and is thus invalid"
      );
    }

    const randomId = generateRandomId(receivedEmail);

    let data = {
      email: receivedEmail,
      status: receivedStatus,
      name: randomId,
      lists: receivedLists ? receivedLists : null,
      preconfirm_subscriptions: true,
    };

    let responseToSendBackFromEndpoint = await sendDataToListMonk(data);

    res.send(responseToSendBackFromEndpoint);
  } else {
    res.send({
      response_message:
        "Email or status of new subscriber is missing from request",
    });
    return console.log(
      "Email or status of new subscriber is missing from request"
    );
  }
});

async function sendDataToListMonk(data) {
  console.log("trying to send data to listmonk");
  const dataToSendToListMonk = data;

  const lmUser = process.env.lmuser;
  const lmPass = process.env.lmpass;

  try {
    const response = await axios.post(listmonkURL, dataToSendToListMonk, {
      auth: { username: lmUser, password: lmPass },
    });

    if (response.data) {
      const stringifiedResponse = JSON.stringify(response.data.data);
      console.log(
        "Successfully submitted data to listmonk. Response: " +
          stringifiedResponse
      );
      if (
        JSON.stringify(response.data.data) &&
        JSON.stringify(response.data.data.id)
      ) {
        backupToMongoDB(
          dataToSendToListMonk.email,
          dataToSendToListMonk.lists,
          dataToSendToListMonk.status
        );
        return { response_message: "User successfully registered" };
      }
    } else {
      console.log(
        "Successfully submitted data to listmonk. Response from ListMonk does not contain data."
      );
      return { response_message: "Data is missing from request." }; // Or handle the case when data is missing
    }
  } catch (error) {
    if (error.response && error.response.status === 409) {
      // Handle the conflict scenario where the email already exists
      console.log(
        "Response from ListMonk: " + JSON.stringify(error.response.data)
      );
      return { response_message: "Your Email is already registered" }; // Return the response data
    } else {
      console.error("An error occurred in the axios post towards LM: " + error);
      return { response_message: "An error occured please try again later" }; // Propagate the error to the caller
    }
  }
}

function backupToMongoDB(email, lists, status) {
  const data = {
    email: email,
    lists: lists,
    status: status,
  };
  const collection = db.collection("maillist");

  collection.insertOne(data, (error, result) => {
    if (error) {
      console.error("Error inserting document:", error);
      return sendErrorToWebHook(
        "Error occured for registering:" + data.email + "  The Error:  " + error
      );
    } else {
      console.log("Document inserted successfully:", result.insertedId);
    }
  });
  sendSuccessFullSignupToWebHook(
    "Successful backup of email " +
      data.email.slice(0, data.email.indexOf("@")) +
      " to mongodb"
  );
}

async function sendErrorToWebHook(data) {
  const whatToSend = data;
  const discordWHUrl = process.env.discordWebHookURL;

  try {
    let response = await axios.post(discordWHUrl, {
      username: "MongoStatus",
      avatar_url:
        "https://www.developer-tech.com/wp-content/uploads/sites/3/2021/02/mongodb-atlas-google-cloud-partnership-nosql-databases-integrations-2.jpg",
      content: whatToSend,
    });

    console.log(response);
    console.log("Error message sent successfully!");
  } catch (error) {
    console.log("Could not deliver error message to webhook!", error);
  }

  console.log("Sending mongoDB Error to Webhook" + data);
}

async function sendSuccessFullSignupToWebHook(data) {
  const whatToSend = data;
  const discordWHUrl = process.env.discordWebHookURL;

  try {
    let response = await axios.post(discordWHUrl, {
      username: "MongoStatus",
      avatar_url:
        "https://www.developer-tech.com/wp-content/uploads/sites/3/2021/02/mongodb-atlas-google-cloud-partnership-nosql-databases-integrations-2.jpg",
      content: whatToSend,
    });

    console.log(response);
    console.log("Error message sent successfully!");
  } catch (error) {
    console.log("Could not deliver success message to webhook!", error);
  }

  console.log("Sending mongoDB Success to Webhook" + data);
}

function generateRandomId(uniqueFactor) {
  const characters = "0123456789abcdefghijklmnopqrstuvwxyzabcd" + uniqueFactor;
  const idLength = 8;
  let randomId = "";

  for (let i = 0; i < idLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomId += characters.charAt(randomIndex);
  }

  return randomId;
}

app.listen(PORT);
console.log("Express listening on port " + PORT);
