const inquirer = require('inquirer');
const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cfonts = require('cfonts');
const { Wallet } = require('ethers');

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BOLD = '\x1b[1m';
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function createSpinner(text) {
  let index = 0;
  let interval = null;
  let isActive = false;
  const maxLineLength = text.length + 2;

  function clearLine() {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  }

  return {
    start() {
      if (isActive) return;
      isActive = true;
      clearLine();
      process.stdout.write(`${CYAN}${SPINNER_FRAMES[index]} ${text}${RESET}`);
      interval = setInterval(() => {
        index = (index + 1) % SPINNER_FRAMES.length;
        clearLine();
        process.stdout.write(`${CYAN}${SPINNER_FRAMES[index]} ${text}${RESET}`);
      }, 100);
    },
    succeed(successText) {
      if (!isActive) return;
      clearInterval(interval);
      isActive = false;
      clearLine();
      process.stdout.write(`${GREEN}${BOLD}✔ ${successText}${RESET}\n`);
    },
    fail(failText) {
      if (!isActive) return;
      clearInterval(interval);
      isActive = false;
      clearLine();
      process.stdout.write(`${RED}✖ ${failText}${RESET}\n`);
    },
    stop() {
      if (!isActive) return;
      clearInterval(interval);
      isActive = false;
      clearLine();
    }
  };
}

function centerText(text) {
  const terminalWidth = process.stdout.columns || 80;
  const textLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, Math.floor((terminalWidth - textLength) / 2));
  return ' '.repeat(padding) + text;
}

cfonts.say('NT Exhaust', {
  font: 'block',
  align: 'center',
  colors: ['cyan', 'black'],
});
console.log(centerText(`${BLUE}=== Telegram Channel 🚀 : NT Exhaust ( @NTExhaust ) ===${RESET}`));
console.log(centerText(`${CYAN}✪ COINSHIFT AUTO REGISTER ✪${RESET}\n`));

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(ms) {
  const seconds = Math.floor(ms / 1000);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`${YELLOW}\rMenunggu ${i} detik... ${RESET}`);
    await delay(1000);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

function readProxiesFromFile(filename) {
  try {
    const content = fs.readFileSync(filename, 'utf8');
    return content.split('\n').map(line => line.trim()).filter(line => line !== '');
  } catch (err) {
    console.log(`${RED}Gagal membaca file proxy.txt: ${err.message}${RESET}`);
    return [];
  }
}

async function doLogin(walletKey, axiosInstance) {
  try {
    const wallet = new Wallet(walletKey);
    const address = wallet.address;

    const privyHeaders = {
      "Host": "auth.privy.io",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
      "Content-Type": "application/json",
      "privy-app-id": "clphlvsh3034xjw0fvs59mrdc",
      "privy-ca-id": "e1e68f54-1300-435d-a880-e0af49fce2fc",
      "privy-client": "react-auth:2.4.1",
      "Origin": "https://campaign.coinshift.xyz",
      "Referer": "https://campaign.coinshift.xyz/"
    };

    const initResponse = await axiosInstance.post("https://auth.privy.io/api/v1/siwe/init", { address }, { headers: privyHeaders });
    const { nonce } = initResponse.data;
    const issuedAt = new Date().toISOString();
    const message = `campaign.coinshift.xyz wants you to sign in with your Ethereum account:
${address}

By signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees.

URI: https://campaign.coinshift.xyz
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}
Resources:
- https://privy.io`;

    const signature = await wallet.signMessage(message);
    const authPayload = {
      message,
      signature,
      chainId: "eip155:1",
      walletClientType: "metamask",
      connectorType: "injected",
      mode: "login-or-sign-up"
    };
    const authResponse = await axiosInstance.post("https://auth.privy.io/api/v1/siwe/authenticate", authPayload, { headers: privyHeaders });
    const { token, user, identity_token } = authResponse.data;
    let displayName = "Unknown";
    if (user && user.linked_accounts) {
      const twitterAcc = user.linked_accounts.find(acc => acc.type === "twitter_oauth" && acc.name);
      if (twitterAcc) displayName = twitterAcc.name.split("|")[0].trim();
    }

    const userLoginPayload = {
      operationName: "UserLogin",
      variables: { data: { externalAuthToken: token } },
      query: `mutation UserLogin($data: UserLoginInput!) {
        userLogin(data: $data)
      }`
    };
    const deformLoginHeaders = {
      "content-type": "application/json",
      "origin": "https://campaign.coinshift.xyz",
      "x-apollo-operation-name": "UserLogin"
    };
    const userLoginResponse = await axiosInstance.post("https://api.deform.cc/", userLoginPayload, { headers: deformLoginHeaders });
    const userLoginToken = userLoginResponse.data.data.userLogin;

    return { userLoginToken, displayName, wallet, address, privyIdToken: identity_token };
  } catch (err) {
    console.log(`${RED}Login gagal untuk akun ${walletKey.slice(0, 8)}...: ${err.message}${RESET}`);
    return null;
  }
}

async function registerAccount(userLoginToken, privyIdToken, axiosInstance, ref) {
  const payload = {
    operationName: "VerifyActivity",
    variables: {
      data: {
        activityId: "b649b901-e4bf-462e-a41e-51691e8c4cea",
        metadata: {
          referralCode: ref
        }
      }
    },
    query: `mutation VerifyActivity($data: VerifyActivityInput!) {
      verifyActivity(data: $data) {
        record {
          id
          activityId
          status
          properties
          createdAt
          rewardRecords {
            id
            status
            appliedRewardType
            appliedRewardQuantity
            appliedRewardMetadata
            error
            rewardId
            reward {
              id
              quantity
              type
              properties
              __typename
            }
            __typename
          }
          __typename
        }
        missionRecord {
          id
          missionId
          status
          createdAt
          rewardRecords {
            id
            status
            appliedRewardType
            appliedRewardQuantity
            appliedRewardMetadata
            error
            rewardId
            reward {
              id
              quantity
              type
              properties
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`
  };

  const headers = {
    "authorization": `Bearer ${userLoginToken}`,
    "content-type": "application/json",
    "x-apollo-operation-name": "VerifyActivity",
    "privy-id-token": privyIdToken,
    "origin": "https://campaign.coinshift.xyz",
    "referer": "https://campaign.coinshift.xyz/"
  };

  try {
    const response = await axiosInstance.post("https://api.deform.cc/", payload, { headers });
    if (response.data.data?.verifyActivity?.record?.status?.toUpperCase() === "COMPLETED") {
      return { success: true, message: "  Pendaftaran berhasil" };
    } else if (response.data.errors) {
      return { success: false, message: response.data.errors[0].message };
    } else {
      return { success: false, message: "  Pendaftaran gagal: Respons tidak valid" };
    }
  } catch (err) {
    return { success: false, message: `Error saat pendaftaran: ${err.message}` };
  }
}

async function performCheckIn(userLoginToken, privyIdToken, axiosInstance) {
  const payload = {
    operationName: "VerifyActivity",
    variables: { data: { activityId: "304a9530-3720-45c8-a778-fbd3060d5cfd" } },
    query: `mutation VerifyActivity($data: VerifyActivityInput!) {
      verifyActivity(data: $data) {
        record {
          id
          activityId
          status
          properties
          createdAt
          rewardRecords {
            id
            status
            appliedRewardType
            appliedRewardQuantity
            appliedRewardMetadata
            error
            rewardId
            reward {
              id
              quantity
              type
              properties
              __typename
            }
            __typename
          }
          __typename
        }
        missionRecord {
          id
          missionId
          status
          createdAt
          rewardRecords {
            id
            status
            appliedRewardType
            appliedRewardQuantity
            appliedRewardMetadata
            error
            rewardId
            reward {
              id
              quantity
              type
              properties
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`
  };

  const headers = {
    "authorization": `Bearer ${userLoginToken}`,
    "content-type": "application/json",
    "x-apollo-operation-name": "VerifyActivity",
    "privy-id-token": privyIdToken,
    "origin": "https://campaign.coinshift.xyz",
    "referer": "https://campaign.coinshift.xyz/"
  };

  try {
    const response = await axiosInstance.post("https://api.deform.cc/", payload, { headers });
    if (response.data.data?.verifyActivity?.record?.status?.toUpperCase() === "COMPLETED") {
      return { success: true, message: "  Check-in berhasil" };
    } else {
      return { success: false, message: response.data.errors ? response.data.errors[0].message : "  Check-in gagal: Respons tidak valid" };
    }
  } catch (err) {
    return { success: false, message: `Error saat check-in: ${err.message}` };
  }
}

async function main() {
  const { useProxy } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useProxy',
      message: `${CYAN}Apakah Anda ingin menggunakan proxy?${RESET}`,
      default: false,
    }
  ]);

  let proxyList = [];
  let proxyMode = null;
  let axiosInstance = axios.create();
  if (useProxy) {
    const proxyAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'proxyType',
        message: `${CYAN}Pilih jenis proxy:${RESET}`,
        choices: ['Rotating', 'Static'],
      }
    ]);
    proxyMode = proxyAnswer.proxyType;
    proxyList = readProxiesFromFile('proxy.txt');
    if (proxyList.length > 0) {
      console.log(`${BLUE}Terdapat ${proxyList.length} proxy.${RESET}\n`);
    } else {
      console.log(`${YELLOW}File proxy.txt kosong atau tidak ditemukan, tidak menggunakan proxy.${RESET}\n`);
    }
  }

  let count;
  while (true) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'count',
        message: `${CYAN}Masukkan jumlah akun: ${RESET}`,
        validate: (value) => {
          const parsed = parseInt(value, 10);
          if (isNaN(parsed) || parsed <= 0) {
            return `${RED}Harap masukkan angka yang valid lebih dari 0!${RESET}`;
          }
          return true;
        }
      }
    ]);
    count = parseInt(answer.count, 10);
    if (count > 0) break;
  }

  const { ref } = await inquirer.prompt([
    {
      type: 'input',
      name: 'ref',
      message: `${CYAN}Masukkan kode reff: ${RESET}`,
    }
  ]);

  console.log(`${YELLOW}\n===================================${RESET}`);
  console.log(`${YELLOW}${BOLD}Creating ${count} Akun ..${RESET}`);
  console.log(`${YELLOW}Note: Jangan Bar Barbar Bang 🗿${RESET}`);
  console.log(`${YELLOW}Saran: Kalau Mau BarBar, gunakan Proxy..${RESET}`);
  console.log(`${YELLOW}=====================================${RESET}\n`);

  const fileName = 'accounts.json';
  let accounts = [];
  if (fs.existsSync(fileName)) {
    try {
      accounts = JSON.parse(fs.readFileSync(fileName, 'utf8'));
    } catch (err) {
      accounts = [];
    }
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < count; i++) {
    console.log(`${CYAN}${BOLD}\n================================ ACCOUNT ${i + 1}/${count} ===============================${RESET}`);

    if (useProxy && proxyList.length > 0) {
      let selectedProxy;
      if (proxyMode === 'Rotating') {
        selectedProxy = proxyList[0];
      } else {
        selectedProxy = proxyList.shift();
        if (!selectedProxy) {
          console.log(`${RED}Tidak ada proxy yang tersisa untuk mode static.${RESET}`);
          process.exit(1);
        }
      }
      console.log(`${WHITE}Menggunakan proxy: ${selectedProxy}${RESET}`);
      const agent = new HttpsProxyAgent(selectedProxy);
      axiosInstance = axios.create({ httpAgent: agent, httpsAgent: agent });
    } else {
      axiosInstance = axios.create();
    }

    let accountIP = '';
    try {
      const ipResponse = await axiosInstance.get('https://api.ipify.org?format=json');
      accountIP = ipResponse.data.ip;
    } catch (error) {
      accountIP = "Gagal mendapatkan IP";
      console.log(`${RED}Error saat mendapatkan IP: ${error.message}${RESET}`);
    }
    console.log(`${WHITE}IP Yang Digunakan: ${accountIP}${RESET}\n`);

    const wallet = Wallet.createRandom();
    const walletAddress = wallet.address;
    const privateKey = wallet.privateKey.startsWith('0x') ? wallet.privateKey.slice(2) : wallet.privateKey;

    console.log(`${GREEN}${BOLD}✔️  Wallet Ethereum berhasil dibuat: ${walletAddress}${RESET}`);

    const loginSpinner = createSpinner(`Memproses login...`);
    loginSpinner.start();
    const loginData = await doLogin(wallet.privateKey, axiosInstance);
    if (!loginData) {
      loginSpinner.fail(`Login gagal setelah max attempt. Melewati akun.`);
      failCount++;
      console.log(`${YELLOW}\nProgress: ${i + 1}/${count} akun telah diregistrasi. (Berhasil: ${successCount}, Gagal: ${failCount})${RESET}`);
      console.log(`${CYAN}${BOLD}====================================================================${RESET}\n`);
      continue;
    }
    loginSpinner.succeed(`  Login Sukses`);

    const { userLoginToken, displayName, privyIdToken } = loginData;

    const regSpinner = createSpinner(`Mengirim data pendaftaran ke API...`);
    regSpinner.start();
    const regResult = await registerAccount(userLoginToken, privyIdToken, axiosInstance, ref);
    if (regResult.success) {
      regSpinner.succeed(`${regResult.message}`);

      const checkinSpinner = createSpinner(`Melakukan check-in harian...`);
      checkinSpinner.start();
      const checkinResult = await performCheckIn(userLoginToken, privyIdToken, axiosInstance);
      checkinSpinner.stop();
      if (checkinResult.success) {
        console.log(`${GREEN}${BOLD}✔ ${checkinResult.message}${RESET}`);
      } else {
        console.log(`${RED}✖ ${checkinResult.message}${RESET}`);
      }

      accounts.push({
        walletAddress,
        privateKey,
        displayName,
        registeredAt: new Date().toISOString()
      });
      try {
        fs.writeFileSync(fileName, JSON.stringify(accounts, null, 2));
        console.log(`${GREEN}${BOLD}✔️  Data akun disimpan ke accounts.json${RESET}`);
      } catch (err) {
        console.log(`${RED}✖ Gagal menyimpan data ke ${fileName}: ${err.message}${RESET}`);
      }

      successCount++;
    } else {
      regSpinner.fail(`${regResult.message}`);
      failCount++;
    }

    console.log(`${YELLOW}\nProgress: ${i + 1}/${count} akun telah diregistrasi. (Berhasil: ${successCount}, Gagal: ${failCount})${RESET}`);
    console.log(`${CYAN}${BOLD}====================================================================${RESET}\n`);

    if (i < count - 1) {
      const randomDelay = Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;
      await countdown(randomDelay);
    }
  }

  console.log(`${BLUE}${BOLD}\nRegistrasi selesai.${RESET}`);
}

main().catch(err => console.log(`${RED}Terjadi error fatal: ${err.message}${RESET}`));