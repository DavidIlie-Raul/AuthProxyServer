import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import bodyParser from "body-parser";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const listmonkURL = "http://127.0.0.1:9000/api/subscribers";
const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

app.use(bodyParser.json());

/**
 * Endpoint to receive ListMonk Data
 */
app.post("/maildata", async (req, res) => {
  const { email, status, lists, name } = req.body;

  if (!email || !status) {
    console.log("Missing email or status");
    return res.send({
      response_message:
        "An error occurred, email or status missing from request",
    });
  }

  console.log("Checking if email is valid...");
  if (!emailPattern.test(email)) {
    console.log("Invalid email format:", email);
    return res.send({ response_message: "Invalid Email" });
  }

  const data = {
    email,
    status,
    name,
    lists: lists || null,
  };

  const responseFromLM = await sendDataToListMonk(data);
  res.send(responseFromLM);
});

/**
 * Send data to ListMonk
 */
async function sendDataToListMonk(data) {
  console.log("Sending data to ListMonk...");

  try {
    const response = await axios.post(listmonkURL, data, {
      auth: {
        username: process.env.lmuser,
        password: process.env.lmpass,
      },
    });

    console.log("ListMonk success:", JSON.stringify(response.data?.data));

    await sendSuccessToWebhook(`New subscriber: ${data.email}`);

    return { response_message: "User successfully registered" };
  } catch (error) {
    if (error.response?.status === 409) {
      console.log("Email already exists in ListMonk");
      return { response_message: "Your Email is already registered" };
    }

    console.error("ListMonk error:", error.message);
    await sendErrorToWebhook(
      `ListMonk error for ${data.email}: ${error.message}`,
    );

    return {
      response_message: "An error occurred, please try again later.",
    };
  }
}

/**
 * Discord Webhooks
 */
async function sendErrorToWebhook(message) {
  if (!process.env.discordWebHookURL) return;

  try {
    await axios.post(process.env.discordWebHookURL, {
      username: "MailProxy",
      content: message,
    });
  } catch (err) {
    console.log("Failed to send error webhook:", err.message);
  }
}

async function sendSuccessToWebhook(message) {
  if (!process.env.discordWebHookURL) return;

  try {
    await axios.post(process.env.discordWebHookURL, {
      username: "MailProxy",
      content: message,
    });
  } catch (err) {
    console.log("Failed to send success webhook:", err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Express listening on port ${PORT}`);
});
