import { firestore } from '../firebase.js';

async function testFirestore() {
  const testRef = firestore.collection('_system_tests').doc('connection-test');

  await testRef.set({
    status: 'connected',
    project: 'media-authenticity-platform',
    timestamp: new Date().toISOString(),
  });

  const snapshot = await testRef.get();

  if (!snapshot.exists) {
    throw new Error('Firestore test document was not found.');
  }

  console.log('======================================');
  console.log('FIRESTORE CONNECTION TEST');
  console.log('======================================');
  console.log('Status:', snapshot.data()?.status);
  console.log('Project:', snapshot.data()?.project);
  console.log('Timestamp:', snapshot.data()?.timestamp);
  console.log('Firestore connection: SUCCESS');
  console.log('======================================');
}

testFirestore().catch((error) => {
  console.error('Firestore connection: FAILED');
  console.error(error);
  process.exit(1);
});
