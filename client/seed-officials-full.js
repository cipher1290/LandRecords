const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const officialSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  designation: { type: String, required: true },
  department: { type: String, required: true },
  officeId: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  isVerified: { type: Boolean, default: true }
}, { timestamps: true });

const Official = mongoose.model('Official', officialSchema);

async function seed() {
  await mongoose.connect('mongodb://localhost:27017/eland-records');
  console.log('Connected to eland-records database');

  const officials = [
    { username: 'clerk1', firstName: 'Clerk', lastName: 'One', email: 'clerk1@gov.in', password: 'clerk123', designation: 'clerk', department: 'Registration Department', officeId: 'OFF_REG_001', phone: '9876543210' },
    { username: 'superintendent1', firstName: 'Super', lastName: 'One', email: 'super1@gov.in', password: 'super123', designation: 'superintendent', department: 'Registration Department', officeId: 'OFF_REG_002', phone: '9876543211' },
    { username: 'project_officer1', firstName: 'Project', lastName: 'Officer', email: 'po1@gov.in', password: 'project123', designation: 'project_officer', department: 'Registration Department', officeId: 'OFF_REG_003', phone: '9876543212' },
    { username: 'vro1', firstName: 'VRO', lastName: 'One', email: 'vro1@gov.in', password: 'vro123', designation: 'vro', department: 'Revenue Department', officeId: 'OFF_REV_001', phone: '9876543213' },
    { username: 'survey1', firstName: 'Survey', lastName: 'One', email: 'survey1@gov.in', password: 'survey123', designation: 'surveyor', department: 'Survey Department', officeId: 'OFF_SUR_001', phone: '9876543214' },
    { username: 'revenue_officer1', firstName: 'Revenue', lastName: 'Inspector', email: 'rev1@gov.in', password: 'revenue123', designation: 'revenue_inspector', department: 'Revenue Department', officeId: 'OFF_REV_002', phone: '9876543215' },
    { username: 'mro1', firstName: 'MRO', lastName: 'One', email: 'mro1@gov.in', password: 'mro123', designation: 'mro', department: 'Revenue Department', officeId: 'OFF_REV_003', phone: '9876543216' },
    { username: 'revenue_dept1', firstName: 'Revenue', lastName: 'Dept', email: 'revdept1@gov.in', password: 'dept123', designation: 'revenue_dept_officer', department: 'Revenue Department', officeId: 'OFF_REV_004', phone: '9876543217' },
    { username: 'joint_collector1', firstName: 'Joint', lastName: 'Collector', email: 'jc1@gov.in', password: 'joint123', designation: 'joint_collector', department: 'Collectorate', officeId: 'OFF_COL_001', phone: '9876543218' },
    { username: 'collector1', firstName: 'District', lastName: 'Collector', email: 'col1@gov.in', password: 'collector123', designation: 'district_collector', department: 'Collectorate', officeId: 'OFF_COL_002', phone: '9876543219' },
    { username: 'mw1', firstName: 'Ministry', lastName: 'Welfare', email: 'mw1@gov.in', password: 'mw123', designation: 'ministry_welfare', department: 'Ministry of Welfare', officeId: 'OFF_MW_001', phone: '9876543220' }
  ];

  for (const off of officials) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(off.password, salt);
    await Official.findOneAndUpdate(
      { username: off.username },
      { ...off, password: hashedPassword },
      { upsert: true, new: true }
    );
    console.log(`Seeded official: ${off.username} (${off.designation})`);
  }

  await mongoose.disconnect();
  console.log('All officials seeded successfully into eland-records!');
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
