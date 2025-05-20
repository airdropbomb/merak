import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui.js/cryptography';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import figlet from 'figlet';
import inquirer from 'inquirer';

// Configuration for transactions and contract constants
const CONFIG = {
    WRAP: {
        enabled: true,
        amount: 100_000_000, // Amount to wrap
    },
    SWAP_wSUI_wDUBHE: {
        enabled: true,
        amount: 10_000_000, // Amount of wSUI to swap
        repeat: 0, // Will be set by user input
    },
    SWAP_wDUBHE_wSUI: {
        enabled: true,
        amount: 1_000, // Amount of wDUBHE to swap
        repeat: 0, // Will be set by user input
    },
    SWAP_wSUI_wSTARS: {
        enabled: true,
        amount: 10_000_000, // Amount of wSUI to swap
        repeat: 0, // Will be set by user input
    },
    SWAP_wSTARS_wSUI: {
        enabled: true,
        amount: 1_000, // Amount of wSTARS to swap
        repeat: 0, // Will be set by user input
    },
    ADD_LIQUIDITY_wSUI_wDUBHE: {
        enabled: true,
        asset0: 0,
        asset1: 1,
        amount0: 1_000_000,
        amount1: 5765,
        min0: 1,
        min1: 1,
        label: 'Add Liquidity wSUI-wDUBHE',
    },
    ADD_LIQUIDITY_wSUI_wSTARS: {
        enabled: true,
        asset0: 0,
        asset1: 3,
        amount0: 1_000_000,
        amount1: 19149,
        min0: 1,
        min1: 1,
        label: 'Add Liquidity wSUI-wSTARS',
    },
    ADD_LIQUIDITY_wDUBHE_wSTARS: {
        enabled: true,
        asset0: 1,
        asset1: 3,
        amount0: 2000,
        amount1: 13873,
        min0: 1,
        min1: 1,
        label: 'Add Liquidity wDUBHE-wSTARS',
    },
    DELAY_BETWEEN_TX_MS: 5000, // Delay between transactions in milliseconds
};

const CONTRACTS = {
    WRAP_TARGET: '0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_wrapper_system::wrap',
    DEX_TARGET: '0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_dex_system::swap_exact_tokens_for_tokens',
    SHARED_OBJECT: '0x8ece4cb6de126eb5c7a375f90c221bdc16c81ad8f6f894af08e0b6c25fb50a45',
    PATHS: {
        wSUI_wDUBHE: [BigInt(0), BigInt(1)],
        wDUBHE_wSUI: [BigInt(1), BigInt(0)],
        wSUI_wSTARS: [BigInt(0), BigInt(3)],
        wSTARS_wSUI: [BigInt(3), BigInt(0)],
    },
};

// Read private keys from pvkey.t5xt
function readKeys(filename = 'pvkey.txt') {
    try {
        return fs.readFileSync(filename, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
    } catch (e) {
        console.error(chalk.red('Error reading key.txt:', e.message));
        process.exit(1);
    }
}

// Display cool banner
function displayBanner() {
    console.log(chalk.cyan(figlet.textSync('SUI   DEX   BOT', { font: 'Standard' })));
    console.log(chalk.yellow('🚀 Automating Wrap, Swap, and Liquidity Created By Kazuha787\n'));
}

// Prompt user for swap counts
async function promptSwapCounts() {
    const questions = [];
    if (CONFIG.SWAP_wSUI_wDUBHE.enabled) {
        questions.push({
            type: 'number',
            name: 'SWAP_wSUI_wDUBHE',
            message: chalk.cyan('How many times to swap wSUI -> wDUBHE?'),
            default: 0,
            validate: (value) => value >= 0 ? true : 'Please enter a non-negative number.',
        });
    }
    if (CONFIG.SWAP_wDUBHE_wSUI.enabled) {
        questions.push({
            type: 'number',
            name: 'SWAP_wDUBHE_wSUI',
            message: chalk.cyan('How many times to swap wDUBHE -> wSUI?'),
            default: 0,
            validate: (value) => value >= 0 ? true : 'Please enter a non-negative number.',
        });
    }
    if (CONFIG.SWAP_wSUI_wSTARS.enabled) {
        questions.push({
            type: 'number',
            name: 'SWAP_wSUI_wSTARS',
            message: chalk.cyan('How many times to swap wSUI -> wSTARS?'),
            default: 0,
            validate: (value) => value >= 0 ? true : 'Please enter a non-negative number.',
        });
    }
    if (CONFIG.SWAP_wSTARS_wSUI.enabled) {
        questions.push({
            type: 'number',
            name: 'SWAP_wSTARS_wSUI',
            message: chalk.cyan('How many times to swap wSTARS -> wSUI?'),
            default: 0,
            validate: (value) => value >= 0 ? true : 'Please enter a non-negative number.',
        });
    }

    const answers = await inquirer.prompt(questions);
    CONFIG.SWAP_wSUI_wDUBHE.repeat = answers.SWAP_wSUI_wDUBHE || 0;
    CONFIG.SWAP_wDUBHE_wSUI.repeat = answers.SWAP_wDUBHE_wSUI || 0;
    CONFIG.SWAP_wSUI_wSTARS.repeat = answers.SWAP_wSUI_wSTARS || 0;
    CONFIG.SWAP_wSTARS_wSUI.repeat = answers.SWAP_wSTARS_wSUI || 0;
}

// Calculate total transactions
function calculateTotalTransactions(keys) {
    let txCount = 0;
    if (CONFIG.WRAP.enabled) txCount++;
    if (CONFIG.SWAP_wSUI_wDUBHE.enabled) txCount += CONFIG.SWAP_wSUI_wDUBHE.repeat;
    if (CONFIG.SWAP_wDUBHE_wSUI.enabled) txCount += CONFIG.SWAP_wDUBHE_wSUI.repeat;
    if (CONFIG.SWAP_wSUI_wSTARS.enabled) txCount += CONFIG.SWAP_wSUI_wSTARS.repeat;
    if (CONFIG.SWAP_wSTARS_wSUI.enabled) txCount += CONFIG.SWAP_wSTARS_wSUI.repeat;
    if (CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.enabled) txCount++;
    if (CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.enabled) txCount++;
    if (CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.enabled) txCount++;
    return txCount * keys.length;
}

// Display transaction summary
function displayTxSummary(keys) {
    console.log(chalk.magenta('\n📊 Transaction Summary:'));
    if (CONFIG.SWAP_wSUI_wDUBHE.enabled) {
        console.log(chalk.cyan(`- Swap wSUI -> wDUBHE: ${CONFIG.SWAP_wSUI_wDUBHE.repeat} times`));
    }
    if (CONFIG.SWAP_wDUBHE_wSUI.enabled) {
        console.log(chalk.cyan(`- Swap wDUBHE -> wSUI: ${CONFIG.SWAP_wDUBHE_wSUI.repeat} times`));
    }
    if (CONFIG.SWAP_wSUI_wSTARS.enabled) {
        console.log(chalk.cyan(`- Swap wSUI -> wSTARS: ${CONFIG.SWAP_wSUI_wSTARS.repeat} times`));
    }
    if (CONFIG.SWAP_wSTARS_wSUI.enabled) {
        console.log(chalk.cyan(`- Swap wSTARS -> wSUI: ${CONFIG.SWAP_wSTARS_wSUI.repeat} times`));
    }
    if (CONFIG.WRAP.enabled) console.log(chalk.cyan('- Wrap wSUI: 1 time'));
    if (CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.enabled) console.log(chalk.cyan('- Add Liquidity wSUI-wDUBHE: 1 time'));
    if (CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.enabled) console.log(chalk.cyan('- Add Liquidity wSUI-wSTARS: 1 time'));
    if (CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.enabled) console.log(chalk.cyan('- Add Liquidity wDUBHE-wSTARS: 1 time'));
    const totalTx = calculateTotalTransactions(keys);
    console.log(chalk.magenta(`\n🔢 Total transactions to perform: ${totalTx} for ${keys.length} key(s)\n`));
}

// Wrap wSUI
async function wrapWsuI(client, keypair, spinner) {
    spinner.text = `Wrapping wSUI for ${keypair.getPublicKey().toSuiAddress()}`;
    const txb = new TransactionBlock();
    const [splitCoin] = txb.splitCoins(txb.gas, [CONFIG.WRAP.amount]);
    txb.moveCall({
        target: CONTRACTS.WRAP_TARGET,
        arguments: [
            txb.object(CONTRACTS.SHARED_OBJECT),
            splitCoin,
            txb.pure.address(keypair.getPublicKey().toSuiAddress()),
        ],
        typeArguments: ['0x2::sui::SUI'],
    });
    try {
        const result = await client.signAndExecuteTransactionBlock({ signer: keypair, transactionBlock: txb });
        logTx('Wrap wSUI', keypair, result?.digest);
        spinner.succeed(`Wrapped wSUI for ${keypair.getPublicKey().toSuiAddress()}`);
    } catch (e) {
        logError('Wrap', keypair, e);
        spinner.fail(`Failed to wrap wSUI for ${keypair.getPublicKey().toSuiAddress()}`);
        throw e;
    }
}

// Generic swap function
async function swapTokens(client, keypair, { amount, path, label, repeat }, spinner) {
    for (let i = 0; i < repeat; i++) {
        spinner.text = `${label} (Run ${i + 1}/${repeat}) for ${keypair.getPublicKey().toSuiAddress()}`;
        const txb = new TransactionBlock();
        txb.moveCall({
            target: CONTRACTS.DEX_TARGET,
            arguments: [
                txb.object(CONTRACTS.SHARED_OBJECT),
                txb.pure(BigInt(amount), 'u256'),
                txb.pure(BigInt(1), 'u256'), // Minimum amount out
                txb.pure(path, 'vector<u256>'),
                txb.pure.address(keypair.getPublicKey().toSuiAddress()),
            ],
            typeArguments: [],
        });
        try {
            const result = await client.signAndExecuteTransactionBlock({ signer: keypair, transactionBlock: txb });
            logTx(`${label} (Run ${i + 1})`, keypair, result?.digest);
            spinner.succeed(`${label} (Run ${i + 1}) completed for ${keypair.getPublicKey().toSuiAddress()}`);
        } catch (e) {
            logError(label, keypair, e);
            spinner.fail(`${label} (Run ${i + 1}) failed for ${keypair.getPublicKey().toSuiAddress()}`);
        }
        if (i < repeat - 1 && CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }
}

// Add liquidity
async function addLiquidity(client, keypair, {
    sharedObject, asset0, asset1, amount0, amount1, min0, min1, recipient, label
}, spinner) {
    spinner.text = `${label} for ${keypair.getPublicKey().toSuiAddress()}`;
    const txb = new TransactionBlock();
    txb.moveCall({
        target: '0xa6477a6bf50e2389383b34a76d59ccfbec766ff2decefe38e1d8436ef8a9b245::dubhe_dex_system::add_liquidity',
        arguments: [
            txb.object(sharedObject),
            txb.pure(BigInt(asset0), 'u256'),
            txb.pure(BigInt(asset1), 'u256'),
            txb.pure(BigInt(amount0), 'u256'),
            txb.pure(BigInt(amount1), 'u256'),
            txb.pure(BigInt(min0), 'u256'),
            txb.pure(BigInt(min1), 'u256'),
            txb.pure.address(recipient),
        ],
        typeArguments: [],
    });
    try {
        const result = await client.signAndExecuteTransactionBlock({ signer: keypair, transactionBlock: txb });
        logTx(label, keypair, result?.digest);
        spinner.succeed(`${label} completed for ${keypair.getPublicKey().toSuiAddress()}`);
    } catch (e) {
        logError(label, keypair, e);
        spinner.fail(`${label} failed for ${keypair.getPublicKey().toSuiAddress()}`);
    }
}

// Logging functions
function logTx(label, keypair, digest) {
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(chalk.yellow(`${label}`) + chalk.cyan(` for ${address}`));
    if (digest) {
        console.log(chalk.green(`Transaction: https://testnet.suivision.xyz/txblock/${digest}`));
    } else {
        console.log(chalk.red('Failed to retrieve transaction digest!'));
    }
}

function logError(label, keypair, e) {
    console.error(chalk.red(`${label} failed for ${keypair.getPublicKey().toSuiAddress()}: ${e.message}`));
}

// Utility sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Process transactions for a single key
async function replayWithKey(privKey, spinner) {
    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    const { secretKey } = decodeSuiPrivateKey(privKey);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);

    // 1. Wrap wSUI
    if (CONFIG.WRAP.enabled) {
        try {
            await wrapWsuI(client, keypair, spinner);
        } catch {
            return;
        }
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }

    // 2. Swap wSUI -> wDUBHE
    if (CONFIG.SWAP_wSUI_wDUBHE.enabled && CONFIG.SWAP_wSUI_wDUBHE.repeat > 0) {
        await swapTokens(client, keypair, {
            amount: CONFIG.SWAP_wSUI_wDUBHE.amount,
            path: CONTRACTS.PATHS.wSUI_wDUBHE,
            label: 'Swap wSUI -> wDUBHE',
            repeat: CONFIG.SWAP_wSUI_wDUBHE.repeat,
        }, spinner);
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }

    // 3. Swap wDUBHE -> wSUI
    if (CONFIG.SWAP_wDUBHE_wSUI.enabled && CONFIG.SWAP_wDUBHE_wSUI.repeat > 0) {
        await swapTokens(client, keypair, {
            amount: CONFIG.SWAP_wDUBHE_wSUI.amount,
            path: CONTRACTS.PATHS.wDUBHE_wSUI,
            label: 'Swap wDUBHE -> wSUI',
            repeat: CONFIG.SWAP_wDUBHE_wSUI.repeat,
        }, spinner);
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }

    // 4. Swap wSUI -> wSTARS
    if (CONFIG.SWAP_wSUI_wSTARS.enabled && CONFIG.SWAP_wSUI_wSTARS.repeat > 0) {
        await swapTokens(client, keypair, {
            amount: CONFIG.SWAP_wSUI_wSTARS.amount,
            path: CONTRACTS.PATHS.wSUI_wSTARS,
            label: 'Swap wSUI -> wSTARS',
            repeat: CONFIG.SWAP_wSUI_wSTARS.repeat,
        }, spinner);
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }

    // 5. Swap wSTARS -> wSUI
    if (CONFIG.SWAP_wSTARS_wSUI.enabled && CONFIG.SWAP_wSTARS_wSUI.repeat > 0) {
        await swapTokens(client, keypair, {
            amount: CONFIG.SWAP_wSTARS_wSUI.amount,
            path: CONTRACTS.PATHS.wSTARS_wSUI,
            label: 'Swap wSTARS -> wSUI',
            repeat: CONFIG.SWAP_wSTARS_wSUI.repeat,
        }, spinner);
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }

    // 6. Add Liquidity wSUI-wSTARS
    if (CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.enabled) {
        await addLiquidity(client, keypair, {
            sharedObject: CONTRACTS.SHARED_OBJECT,
            asset0: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.asset0,
            asset1: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.asset1,
            amount0: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.amount0,
            amount1: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.amount1,
            min0: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.min0,
            min1: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.min1,
            recipient: keypair.getPublicKey().toSuiAddress(),
            label: CONFIG.ADD_LIQUIDITY_wSUI_wSTARS.label,
        }, spinner);
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }

    // 7. Add Liquidity wSUI-wDUBHE
    if (CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.enabled) {
        await addLiquidity(client, keypair, {
            sharedObject: CONTRACTS.SHARED_OBJECT,
            asset0: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.asset0,
            asset1: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.asset1,
            amount0: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.amount0,
            amount1: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.amount1,
            min0: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.min0,
            min1: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.min1,
            recipient: keypair.getPublicKey().toSuiAddress(),
            label: CONFIG.ADD_LIQUIDITY_wSUI_wDUBHE.label,
        }, spinner);
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }

    // 8. Add Liquidity wDUBHE-wSTARS
    if (CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.enabled) {
        await addLiquidity(client, keypair, {
            sharedObject: CONTRACTS.SHARED_OBJECT,
            asset0: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.asset0,
            asset1: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.asset1,
            amount0: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.amount0,
            amount1: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.amount1,
            min0: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.min0,
            min1: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.min1,
            recipient: keypair.getPublicKey().toSuiAddress(),
            label: CONFIG.ADD_LIQUIDITY_wDUBHE_wSTARS.label,
        }, spinner);
        if (CONFIG.DELAY_BETWEEN_TX_MS) await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
    }
}

// Main function to process all keys
async function main() {
    const keys = readKeys();
    displayBanner();
    await promptSwapCounts();
    displayTxSummary(keys);

    const spinner = ora('Starting transactions...').start();

    for (const privKey of keys) {
        try {
            await replayWithKey(privKey, spinner);
        } catch (e) {
            spinner.fail(`Error processing key: ${e.message}`);
        }
        if (CONFIG.DELAY_BETWEEN_TX_MS) {
            await sleep(CONFIG.DELAY_BETWEEN_TX_MS);
        }
    }

    spinner.succeed(chalk.green('All transactions completed! 🎉'));
}

main().catch((e) => {
    console.error(chalk.red('Fatal error:', e.message));
    process.exit(1);
});
