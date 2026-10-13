const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'fixtures', 'imports');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Bank Statement Period 1 (Jul 2025 - Mar 2026, 505 transactions)
const stmt1 = [];
stmt1.push('CANARA BANK / STATEMENT OF ACCOUNT');
stmt1.push('Account Holder Name: Kaaviya R');
stmt1.push('Account Number: 102938475610');
stmt1.push('Customer ID: CUST982314');
stmt1.push('Branch: T. Nagar, Chennai (0012)');
stmt1.push('IFSC: CNRB0001234');
stmt1.push('Currency: INR');
stmt1.push('Account Type: SAVINGS BANK ACCOUNT');
stmt1.push('MICR Code: 600015012');
stmt1.push('Nomination Registered: YES');
stmt1.push('Opening Balance as on 01-Jul-2025: INR 35,420.50');
stmt1.push('Statement Period: 01-Jul-2025 to 31-Mar-2026');
stmt1.push('Generated On: 12-Oct-2026 10:15:22 UTC');
stmt1.push('Product Code: SB-GEN-PUB-IND');
stmt1.push('Status: ACTIVE');
stmt1.push('Drawing Power: 0.00');
stmt1.push('Sanction Limit: 0.00');
stmt1.push('Sweep Balance: 0.00');
stmt1.push(''); // Line 19
// Line 20: Table Header
stmt1.push('Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL');

let curBal1 = 35420.50;
let curDate1 = new Date('2025-07-01T00:00:00Z');
const counterparties = ['Swiggy', 'Zomato', 'Amazon Pay', 'Airtel Postpaid', 'Uber India', 'Zepto Delivery', 'Blinkit', 'Apollo Pharmacy', 'Indian Oil', 'Mutual Fund SIP', 'Electricity Bill'];

for (let i = 1; i <= 505; i++) {
  curDate1 = new Date(curDate1.getTime() + Math.floor(11 * 3600 * 1000 + (i % 5) * 2 * 3600 * 1000));
  if (curDate1 > new Date('2026-03-31T00:00:00Z')) {
    curDate1 = new Date('2026-03-31T00:00:00Z');
  }
  const dd = String(curDate1.getUTCDate()).padStart(2, '0');
  const mm = String(curDate1.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = curDate1.getUTCFullYear();
  const dateStr = dd + '-' + mm + '-' + yyyy;

  const isCredit = (i % 25 === 0);
  let dr = '';
  let cr = '';
  let narration = '';

  if (isCredit) {
    const amt = (i % 50 === 0) ? 65000.00 : 8500.00;
    cr = amt.toFixed(2);
    curBal1 += amt;
    narration = 'SALARY/NEFT/00293847/CORP PAYROLL';
  } else {
    const amt = parseFloat((120 + ((i * 17) % 850) + (i % 7) * 45).toFixed(2));
    dr = amt.toFixed(2);
    curBal1 = Math.max(1200.00, curBal1 - amt);
    const cp = counterparties[i % counterparties.length];
    narration = 'UPI/P2M/' + (100000 + i) + '/' + cp + '/ICICI';
  }

  stmt1.push(dateStr + ',,' + narration + ',' + dr + ',' + cr + ',' + curBal1.toFixed(2) + ',0012');
}

stmt1.push('');
stmt1.push('*** END OF STATEMENT ***');
stmt1.push('Total Transactions: 505');
stmt1.push('Closing Balance: INR ' + curBal1.toFixed(2));

fs.writeFileSync(path.join(outDir, 'bank_statement_period1.csv'), stmt1.join('\n'));

// 2. Bank Statement Period 2 (Apr 2026 - Oct 12, 2026, 817 transactions)
const stmt2 = [];
stmt2.push('CANARA BANK / STATEMENT OF ACCOUNT');
stmt2.push('Account Holder Name: Kaaviya R');
stmt2.push('Account Number: 102938475610');
stmt2.push('Customer ID: CUST982314');
stmt2.push('Branch: T. Nagar, Chennai (0012)');
stmt2.push('IFSC: CNRB0001234');
stmt2.push('Currency: INR');
stmt2.push('Account Type: SAVINGS BANK ACCOUNT');
stmt2.push('MICR Code: 600015012');
stmt2.push('Nomination Registered: YES');
stmt2.push('Opening Balance as on 01-Apr-2026: INR ' + curBal1.toFixed(2));
stmt2.push('Statement Period: 01-Apr-2026 to 12-Oct-2026');
stmt2.push('Generated On: 12-Oct-2026 14:02:10 UTC');
stmt2.push('Product Code: SB-GEN-PUB-IND');
stmt2.push('Status: ACTIVE');
stmt2.push('Drawing Power: 0.00');
stmt2.push('Sanction Limit: 0.00');
stmt2.push('Sweep Balance: 0.00');
stmt2.push(''); // Line 19
stmt2.push('Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL');

let curBal2 = curBal1;
let curDate2 = new Date('2026-04-01T00:00:00Z');
for (let i = 1; i <= 817; i++) {
  curDate2 = new Date(curDate2.getTime() + Math.floor(5 * 3600 * 1000 + (i % 4) * 3600 * 1000));
  if (curDate2 > new Date('2026-10-12T00:00:00Z')) {
    curDate2 = new Date('2026-10-12T00:00:00Z');
  }
  const dd = String(curDate2.getUTCDate()).padStart(2, '0');
  const mm = String(curDate2.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = curDate2.getUTCFullYear();
  const dateStr = dd + '-' + mm + '-' + yyyy;

  const isCredit = (i % 30 === 0);
  let dr = '';
  let cr = '';
  let narration = '';

  if (isCredit) {
    const amt = (i % 60 === 0) ? 72000.00 : 12000.00;
    cr = amt.toFixed(2);
    curBal2 += amt;
    narration = 'NEFT/INW/00384729/SALARY CREDIT';
  } else {
    const amt = parseFloat((85 + ((i * 19) % 720) + (i % 11) * 35).toFixed(2));
    dr = amt.toFixed(2);
    curBal2 = Math.max(950.00, curBal2 - amt);
    const cp = counterparties[i % counterparties.length];
    narration = 'UPI/P2M/' + (200000 + i) + '/' + cp + '/HDFC';
  }

  stmt2.push(dateStr + ',,' + narration + ',' + dr + ',' + cr + ',' + curBal2.toFixed(2) + ',0012');
}

stmt2.push('');
stmt2.push('*** END OF STATEMENT ***');
stmt2.push('Total Transactions: 817');
stmt2.push('Closing Balance: INR ' + curBal2.toFixed(2));

fs.writeFileSync(path.join(outDir, 'bank_statement_period2.csv'), stmt2.join('\n'));

// 3. Srivarsan UPI Export (Oct 2025 - Oct 12, 2026, 373 records)
// Exactly 357 debits, 10 credits, 6 self-transfers, 8 records without time
const upiRows = [];
upiRows.push('date,time,transaction_type,counterparty,description,account,amount_inr,upi_transaction_id,note');

let upiDate = new Date('2025-10-01T00:00:00Z');
const upiCounterparties = ['Swiggy', 'Zomato', 'Amazon Pay', 'Google Play', 'Uber', 'Dunzo', 'BookMyShow', 'BigBasket', 'Myntra', 'Chai Point', 'Starbucks', 'CultFit'];

for (let i = 1; i <= 373; i++) {
  upiDate = new Date(upiDate.getTime() + Math.floor(21 * 3600 * 1000 + (i % 6) * 3600 * 1000));
  if (upiDate > new Date('2026-10-12T12:00:00Z')) {
    upiDate = new Date('2026-10-12T10:30:00Z');
  }
  const dateStr = upiDate.toISOString().slice(0, 10);

  // Exactly 8 records without time
  const missingTime = [5, 23, 71, 114, 189, 240, 310, 355].includes(i);
  const timeStr = missingTime ? '' : upiDate.toISOString().slice(11, 19);

  let txType = 'debit';
  if ([50, 90, 130, 170, 210, 250, 290, 320, 340, 365].includes(i)) {
    txType = 'credit'; // Exactly 10
  } else if ([40, 80, 150, 220, 280, 330].includes(i)) {
    txType = 'self_transfer'; // Exactly 6
  }

  let cp = '';
  let desc = '';
  let amt = 0;

  if (txType === 'credit') {
    cp = (i % 2 === 0) ? 'Cashback Reward' : 'Refund Reversal';
    desc = 'UPI Credit Received';
    amt = (i % 2 === 0) ? 75.00 : 450.00;
  } else if (txType === 'self_transfer') {
    cp = 'Own Account - HDFC';
    desc = 'Transfer to secondary account';
    amt = 2500.00;
  } else {
    cp = upiCounterparties[i % upiCounterparties.length];
    desc = 'Payment to ' + cp;
    amt = parseFloat((40.00 + (i % 13) * 65.00 + (i % 5) * 120.00).toFixed(2));
  }

  const upiId = 'UPI' + (202500000000 + i);
  const note = (i % 8 === 0) ? 'Personal' : '';

  upiRows.push(dateStr + ',' + timeStr + ',' + txType + ',' + cp + ',' + desc + ',Primary Account,' + amt.toFixed(2) + ',' + upiId + ',' + note);
}

fs.writeFileSync(path.join(outDir, 'upi_transactions.csv'), upiRows.join('\n'));

console.log('Successfully generated fixtures: 505 + 817 + 373 = 1695 transactions total.');
