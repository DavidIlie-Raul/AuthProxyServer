import express, { response } from "express";
import { MongoClient, ServerApiVersion } from "mongodb";
import axios from "axios";
import dotenv from "dotenv";
import bodyParser from "body-parser";
dotenv.config();

const uri = `mongodb+srv://${process.env.mongouser}:${process.env.mongopass}@mailcluster.xowmhmr.mongodb.net/?retryWrites=true&w=majority`;
const mauticBaseURL = "http://mautic.peacefulriches.com/api";
const mauticContactCreationURL = `${mauticBaseURL}/contacts/new`;
const mauticEmailCheckURL = `${mauticBaseURL}/contacts`;

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
//connectToMongoDB();

const db = client.db("maildb");

//Endpoint to receive Mautic Data
app.post("/maildata", async (req, res) => {
  if (req.body.email && req.body.name) {
    const receivedEmail = req.body?.email;
    const receivedName = req.body?.name;

    console.log(receivedEmail, receivedName);
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

    const spaceIndex = receivedName.indexOf(" ");
    const lastName =
      spaceIndex !== -1 ? receivedName.substring(0, spaceIndex) : receivedName;
    const firstName =
      spaceIndex !== -1 ? receivedName.substring(spaceIndex + 1) : "";

    let data = {
      firstname: firstName,
      lastname: lastName,
      email: receivedEmail,
    };

    console.log(data);

    let responseToSendBackFromEndpoint = await sendDataToMautic(data);

    res.send(responseToSendBackFromEndpoint);
  } else {
    res.send({
      response_message:
        "An Error has occurred, please make sure the email and name you have provided is valid",
    });
    return console.log(
      "Email or name of new subscriber is missing from request"
    );
  }
});

async function sendDataToMautic(data) {
  console.log("trying to send data to mautic");
  const dataToSendToMautic = data;

  const mauticUser = process.env.mauticuser;
  const mauticPass = process.env.mauticpass;

  try {
    const response = await axios
      .post(mauticContactCreationURL, dataToSendToMautic, {
        auth: { username: mauticUser, password: mauticPass },
      })
      .catch((error) => {
        console.log(error);
      });

    if (response.data) {
      console.log("Successfully submitted data to mautic");
      if (response.data && response.data.contact.id) {
        await backupToMongoDB(data.name, data.email);
        return { response_message: "User successfully registered" };
      }
    } else {
      console.log(
        "Successfully submitted data to mautic. Response from Mautic does not contain data."
      );
      return { response_message: "User successfully registered" }; // Or handle the case when data is missing
    }
  } catch (error) {
    console.error(
      "An error occurred in the axios post towards mautic: " + error
    );
    return {
      response_message:
        "An error occured, please make sure you provided a correct email address and try again later.",
      // Propagate the error to the caller
    };
  }
}

async function backupToMongoDB(name, email) {
  const collection = db.collection("maillist");

  const emailLookupResponse = await collection
    .find({
      email: { $regex: `${email}` },
    })
    .toArray();
  console.log(emailLookupResponse);

  if (emailLookupResponse.length > 0) {
    return console.log("Email already exists");
  }

  const data = {
    name: name,
    email: email,
  };
  const totalSubs = await collection.estimatedDocumentCount();

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
      " to mongodb, Total subs as of now: " +
      totalSubs
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
    console.log("Discord Webhook Error message sent successfully!");
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

    console.log("Success message sent successfully!");
  } catch (error) {
    console.log("Could not deliver success message to webhook!", error);
  }

  console.log("Sending mongoDB Success to Webhook" + data);
}

app.listen(PORT);
console.log("Express listening on port " + PORT);
