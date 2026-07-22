const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '45.56.79.242', // try remote IP since local might not have MySQL if it's on Cloudez
  user: 'mrblasterinpyx',
  password: '3Gq)y#J%im6#->',
  database: 'Nat_Est_DB',
  port: 3306
});

async function clear() {
  try {
    await pool.query('TRUNCATE TABLE interactions');
    console.log('Interactions cleared!');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

clear();
