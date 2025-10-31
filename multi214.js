// DualChainKeyChecker.js
// Run: node DualChainKeyChecker.js
// Requires: npm install ethers@5 tronweb

"use strict";

const fs = require("fs");
const { ethers } = require("ethers");
let TronWeb = require("tronweb");

// Handle TronWeb module variations
if (typeof TronWeb !== "function" && TronWeb.TronWeb) {
  TronWeb = TronWeb.TronWeb;
} else if (typeof TronWeb !== "function" && TronWeb.default) {
  TronWeb = TronWeb.default;
}

// ---------------- CONFIG ----------------
const delayMs = 500; // milliseconds between checks
// ----------------------------------------

const hexChars = "0123456789abcdef";

// ✅ Generate random 59-length hex
function generateRandomHex64() {
  let result = "";
  for (let i = 0; i < 59; i++) {
    const randomIndex = Math.floor(Math.random() * 16);
    result += hexChars[randomIndex];
  }
  return result;
}

// ✅ Delay helper
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== Ethereum Setup ==========
const provider = new ethers.providers.JsonRpcProvider("https://eth.llamarpc.com");

async function getEthBalance(address) {
  try {
    const balanceWei = await provider.getBalance(address);
    return parseFloat(ethers.utils.formatEther(balanceWei));
  } catch (err) {
    return "Error: " + err.message;
  }
}

// ========== Tron Setup ==========
const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });

async function getTrxBalance(address, retries = 3, waitMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const balanceSun = await tronWeb.trx.getBalance(address);
      return balanceSun / 1e6; // SUN → TRX
    } catch (err) {
      console.warn(
        `⚠️ TRX balance check failed for ${address} (attempt ${attempt}/${retries}): ${err.message}`
      );
      if (attempt < retries) await delay(waitMs * attempt);
      else return "Error: " + err.message;
    }
  }
}

// ========== Main Function ==========
(async () => {
  console.log("🔍 Starting Dual Chain (ETH + TRON) Key Scanner...");
  const prekey = generateRandomHex64();
  const newKeys = [];

  // Generate many private keys
  for (let i1 = 0; i1 < 16; i1++) {
    for (let i2 = 0; i2 < 16; i2++) {
      for (let i3 = 0; i3 < 16; i3++) {
        for (let i4 = 0; i4 < 16; i4++) {
          for (let i5 = 0; i5 < 16; i5++) {
            const str =
              prekey +
              hexChars[i1] +
              hexChars[i2] +
              hexChars[i3] +
              hexChars[i4] +
              hexChars[i5];
            newKeys.push(str);
          }
        }
      }
    }
  }

  console.log(`✅ ${newKeys.length} private keys generated.`);

  // Load targets (if any)
  let targets = [];
  if (fs.existsSync("target_addresses.txt")) {
    const data = fs.readFileSync("target_addresses.txt", "utf8");
    targets = data
      .split("\n")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0);
  }

  let Invalid = 0;
  const ethOutput = [];
  const tronOutput = [];

  for (let i = 0; i < newKeys.length; i++) {
    let privateKey = newKeys[i].trim();
    if (!privateKey.startsWith("0x")) privateKey = "0x" + privateKey;

    try {
      // Derive ETH + TRON addresses
      const wallet = new ethers.Wallet(privateKey);
      const tronAddr = tronWeb.address.fromPrivateKey(privateKey.replace("0x", ""));

      // Fetch balances in parallel
      const [ethBal, trxBal] = await Promise.all([
        getEthBalance(wallet.address),
        getTrxBalance(tronAddr),
      ]);

      console.log(`-----> ${privateKey}`);
      console.log(`   ETH  → ${wallet.address} → ${ethBal} ETH ----> TRON → ${tronAddr} → ${trxBal} TRX`);

      // ✅ Stop if any funded wallet found
      if (
        (typeof ethBal === "number" && ethBal > 0) ||
        (typeof trxBal === "number" && trxBal > 0)
      ) {
        const result = [
          `Private Key: ${privateKey}`,
          `ETH Address: ${wallet.address} (${ethBal} ETH)`,
          `TRON Address: ${tronAddr} (${trxBal} TRX)`,
          "",
        ].join("\n");

        fs.appendFileSync("funded_wallets.txt", result);
        console.log("🎉 FOUND FUNDED WALLET! Script stopped.");
        process.exit(0);
      }

      // ✅ Check if matches any target address
      const lowerEth = wallet.address.toLowerCase();
      const lowerTron = tronAddr.toLowerCase();
      if (targets.includes(lowerEth) || targets.includes(lowerTron)) {
        const result = [
          `Target Match!`,
          `Private Key: ${privateKey}`,
          `ETH Address: ${wallet.address} (${ethBal} ETH)`,
          `TRON Address: ${tronAddr} (${trxBal} TRX)`,
          "",
        ].join("\n");
        fs.appendFileSync("target_matches.txt", result);
        console.log("✅ Found target match:", wallet.address, "|", tronAddr);
      }

    } catch (err) {
      Invalid++;
      console.log(`❌ Invalid key #${i + 1}: ${privateKey} | ${err.message}`);
    }

    // await delay(delayMs);
  }

  console.log(`✅ Finished. Invalid keys: ${Invalid}`);
  console.log("Results saved to funded_wallets.txt and target_matches.txt");
})();
