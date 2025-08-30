const { MongoClient } = require('mongodb');

async function findVoltageCard() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('kemmei');
  const collection = db.collection('cards');
  
  const voltageCards = await collection.find({
    $and: [
      { domain_id: '5.0' },
      { subdomain_id: '5.1' },
      {
        $or: [
          { question_text: { $regex: /standard ATX power supply/i } },
          { question_text: { $regex: /voltages.*delivered.*motherboard/i } },
          { question_text: { $regex: /3\.3V.*5V.*12V/i } },
          { explanation: { $regex: /3\.3V.*5V.*12V/i } },
          { tags: { $regex: /ATX/i } },
          { tags: { $regex: /power supply voltages/i } }
        ]
      }
    ]
  }).toArray();
  
  console.log('Cards about ATX power supply voltages:');
  voltageCards.forEach((card, index) => {
    console.log(`\n=== Card ${index + 1} ===`);
    console.log(`ID: ${card._id}`);
    console.log(`Question: ${card.question_text}`);
    console.log(`Tags: ${card.tags}`);
    console.log(`Answer Options: ${JSON.stringify(card.answer_options || 'N/A')}`);
    console.log(`Explanation: ${card.explanation.substring(0, 150)}...`);
  });
  
  await client.close();
}

findVoltageCard().catch(console.error);
