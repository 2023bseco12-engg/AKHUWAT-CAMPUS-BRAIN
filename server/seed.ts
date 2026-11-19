import { db } from './db.ts';
import { hashPassword } from './auth.ts';

export function seedDatabaseIfEmpty(): void {
  const deptCount = (db.prepare('SELECT COUNT(*) as c FROM departments').get() as { c: number }).c;
  if (deptCount > 0) {
    db.prepare(
      `UPDATE archive_documents
       SET file_url = '/assets/aistudio/image_1b288e46.png',
           file_name = 'chakwal_campus_charter_2018.png',
           file_type = 'image/png'
       WHERE file_url = '/src/assets/images/campus_hero_chakwal_1795066904417.jpg'`
    ).run();

    const migrated = db
      .prepare(`SELECT id FROM audit_logs WHERE action = 'DEMO_TAG_MIGRATION_V1' LIMIT 1`)
      .get();
    if (!migrated) {
      db.exec(`
        UPDATE students SET is_demo = 1 WHERE student_uid GLOB 'STU-00[0-2][0-9]' AND CAST(substr(student_uid, 5) AS INTEGER) <= 24;
        UPDATE faculty SET is_demo = 1 WHERE employee_id GLOB 'FAC-ACW-0[0-1][0-9]' AND CAST(substr(employee_id, 9) AS INTEGER) <= 12;
        UPDATE financial_assistance SET is_demo = 1 WHERE student_id IN (SELECT id FROM students WHERE is_demo = 1);
        UPDATE achievements SET is_demo = 1 WHERE student_id IN (SELECT id FROM students WHERE is_demo = 1);
        UPDATE events SET is_demo = 1 WHERE id <= 7;
        UPDATE archive_documents SET is_demo = 1 WHERE id <= 6;
        UPDATE resources SET is_demo = 1 WHERE id <= 8;
        UPDATE announcements SET is_demo = 1 WHERE id <= 4;
      `);
      db.prepare(
        `INSERT INTO audit_logs (user_email, user_role, action, entity_type, entity_id, details)
         VALUES ('system', 'SYSTEM', 'DEMO_TAG_MIGRATION_V1', 'database', 'is_demo', 'Tagged initial seeded records as demonstration dataset')`
      ).run();
    }
    return;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    // 1. Departments (5 departments at Akhuwat College for Women, Chakwal)
    const insertDept = db.prepare(`
      INSERT INTO departments (code, name, head_name, description, established_year, building_location)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertDept.run('BS-CS', 'Computer Science & Information Technology', 'Dr. Sadia Mahmood', 'Undergraduate software engineering, artificial intelligence, and computing sciences.', 2019, 'Allama Iqbal Academic Block, Floor 2');
    insertDept.run('BS-ECO', 'Economics & Development Studies', 'Prof. Ayesha Siddiqui', 'Quantitative economics, microfinance policy, and regional development research.', 2018, 'Fatima Jinnah Block, Floor 1');
    insertDept.run('BS-ENG', 'English Literature & Linguistics', 'Dr. Hina Zafar', 'Applied linguistics, literary criticism, and academic communication.', 2018, 'Fatima Jinnah Block, Floor 2');
    insertDept.run('BS-EDU', 'Education & Pedagogy', 'Dr. Farah Naureen', 'Teacher training, curriculum design, and educational leadership.', 2020, 'Sir Syed Wing, Ground Floor');
    insertDept.run('BS-MGT', 'Business & Entrepreneurship', 'Ms. Rabia Tariq', 'Social enterprise, Islamic microfinance, accounting, and women entrepreneurship.', 2021, 'Allama Iqbal Academic Block, Floor 1');

    const deptRows = db.prepare('SELECT id, code FROM departments').all() as Array<{ id: number; code: string }>;
    const deptId: Record<string, number> = {};
    for (const d of deptRows) deptId[d.code] = d.id;

    // 2. Programs
    const insertProg = db.prepare(`
      INSERT INTO programs (code, name, department_id, degree_level, duration_years, total_semesters, credit_hours, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertProg.run('BSCS', 'BS Computer Science', deptId['BS-CS'], 'Undergraduate', 4, 8, 134, 'Active');
    insertProg.run('BSIT', 'BS Information Technology', deptId['BS-CS'], 'Undergraduate', 4, 8, 132, 'Active');
    insertProg.run('BSECO', 'BS Economics', deptId['BS-ECO'], 'Undergraduate', 4, 8, 128, 'Active');
    insertProg.run('BSENG', 'BS English Literature & Linguistics', deptId['BS-ENG'], 'Undergraduate', 4, 8, 126, 'Active');
    insertProg.run('BED', 'B.Ed (Hons) Elementary & Secondary', deptId['BS-EDU'], 'Undergraduate', 4, 8, 130, 'Active');
    insertProg.run('BBA', 'BBA Social Entrepreneurship', deptId['BS-MGT'], 'Undergraduate', 4, 8, 132, 'Active');

    const progRows = db.prepare('SELECT id, code FROM programs').all() as Array<{ id: number; code: string }>;
    const progId: Record<string, number> = {};
    for (const p of progRows) progId[p.code] = p.id;

    // 3. Semesters
    const insertSem = db.prepare(`
      INSERT INTO semesters (code, name, academic_year, start_date, end_date, is_current)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertSem.run('FALL-2024', 'Fall 2024', '2024-2025', '2024-09-02', '2025-01-18', 0);
    insertSem.run('SPRING-2025', 'Spring 2025', '2024-2025', '2025-02-03', '2025-06-20', 0);
    insertSem.run('FALL-2025', 'Fall 2025', '2025-2026', '2025-09-01', '2026-01-16', 0);
    insertSem.run('FALL-2026', 'Fall 2026', '2026-2027', '2026-09-07', '2027-01-22', 1);

    const semRows = db.prepare('SELECT id, code FROM semesters').all() as Array<{ id: number; code: string }>;
    const semId: Record<string, number> = {};
    for (const s of semRows) semId[s.code] = s.id;

    // 4. Faculty (12 demo faculty members)
    const insertFaculty = db.prepare(`
      INSERT INTO faculty (employee_id, full_name, email, phone, photo_url, department_id, designation, qualification, specialization, subjects_taught, experience_years, joining_date, responsibilities, status, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertFaculty.run('FAC-ACW-001', 'Dr. Sadia Mahmood', 'sadia.mahmood@acw.edu.pk', '+92-300-5112001', '/src/assets/images/avatar_principal_portrait_1795066904766.jpg', deptId['BS-CS'], 'Professor & Principal', 'Ph.D. Computer Science (NUST)', 'Artificial Intelligence & Educational Informatics', 'Machine Learning, Research Methodology', 16, '2018-08-15', 'Principal & Chair of Academic Council', 'Active');
    insertFaculty.run('FAC-ACW-002', 'Ms. Zainab Qureshi', 'zainab.qureshi@acw.edu.pk', '+92-321-5408112', null, deptId['BS-CS'], 'Assistant Professor', 'MS Software Engineering (FAST)', 'Distributed Systems & Web Engineering', 'Data Structures, Database Systems, Web Technologies', 7, '2020-02-10', 'FYP Coordinator & Lab Incharge', 'Active');
    insertFaculty.run('FAC-ACW-003', 'Ms. Mahnoor Khalid', 'mahnoor.khalid@acw.edu.pk', '+92-333-5889012', null, deptId['BS-CS'], 'Lecturer', 'MS Data Science (QAU)', 'Applied Machine Learning & NLP', 'Programming Fundamentals, Python for Data Science', 4, '2022-09-01', 'Coding Society Advisor', 'Active');
    insertFaculty.run('FAC-ACW-004', 'Prof. Ayesha Siddiqui', 'ayesha.siddiqui@acw.edu.pk', '+92-301-5224109', null, deptId['BS-ECO'], 'Associate Professor & HOD', 'M.Phil. Economics (PIDE)', 'Development Economics & Microfinance', 'Macroeconomics, Econometrics, Development Policy', 13, '2018-09-01', 'Head of Economics & Scholarship Committee Member', 'Active');
    insertFaculty.run('FAC-ACW-005', 'Ms. Uzma Batool', 'uzma.batool@acw.edu.pk', '+92-345-5911204', null, deptId['BS-ECO'], 'Lecturer', 'M.Phil. Economics (IIUI)', 'Public Finance & Gender Economics', 'Microeconomics, Islamic Banking & Finance', 5, '2021-08-20', 'Semester Coordinator Economics', 'Active');
    insertFaculty.run('FAC-ACW-006', 'Dr. Hina Zafar', 'hina.zafar@acw.edu.pk', '+92-302-5331890', null, deptId['BS-ENG'], 'Associate Professor & HOD', 'Ph.D. English Linguistics (NUML)', 'Sociolinguistics & Discourse Analysis', 'Sociolinguistics, Literary Theory, Academic Writing', 11, '2018-10-05', 'Head of English & Literary Magazine Editor', 'Active');
    insertFaculty.run('FAC-ACW-007', 'Ms. Sana Nawaz', 'sana.nawaz@acw.edu.pk', '+92-312-5667231', null, deptId['BS-ENG'], 'Lecturer', 'M.Phil. English Literature (GCU)', 'Postcolonial South Asian Fiction', 'Classical Poetry, Modern Drama, Functional English', 6, '2020-09-14', 'Debating Society Patron', 'Active');
    insertFaculty.run('FAC-ACW-008', 'Dr. Farah Naureen', 'farah.naureen@acw.edu.pk', '+92-300-5772398', null, deptId['BS-EDU'], 'Associate Professor & HOD', 'Ph.D. Education (UE Lahore)', 'Curriculum Design & Teacher Assessment', 'Foundations of Education, Educational Psychology', 12, '2020-01-15', 'Head of Education & Teaching Practicum Director', 'Active');
    insertFaculty.run('FAC-ACW-009', 'Ms. Nadia Jabeen', 'nadia.jabeen@acw.edu.pk', '+92-334-5441098', null, deptId['BS-EDU'], 'Lecturer', 'M.Phil. Educational Leadership', 'Inclusive Pedagogy & Assessment', 'Classroom Management, Curriculum Development', 5, '2021-09-10', 'Community Outreach Lead', 'Active');
    insertFaculty.run('FAC-ACW-010', 'Ms. Rabia Tariq', 'rabia.tariq@acw.edu.pk', '+92-322-5990182', null, deptId['BS-MGT'], 'Assistant Professor & HOD', 'MS Management Sciences (LUMS)', 'Social Entrepreneurship & Women-Led SMEs', 'Principles of Management, Social Entrepreneurship', 8, '2021-02-01', 'Head of Business & Incubation Center Lead', 'Active');
    insertFaculty.run('FAC-ACW-011', 'Ms. Amna Shahzad', 'amna.shahzad@acw.edu.pk', '+92-331-5102938', null, deptId['BS-MGT'], 'Lecturer', 'MBA Finance (IBA)', 'Microenterprise Accounting & Financial Inclusion', 'Financial Accounting, Business Communication', 4, '2023-02-12', 'Career Counseling Liaison', 'Active');
    insertFaculty.run('FAC-ACW-012', 'Ms. Bushra Ilyas', 'bushra.ilyas@acw.edu.pk', '+92-304-5821940', null, deptId['BS-CS'], 'Lab Instructor', 'BS Computer Science (ACW Chakwal)', 'Database Administration & Lab Systems', 'Database Lab, Networking Lab', 3, '2024-01-10', 'Computer Lab & Campus Digital Inventory Lead', 'Active');

    const facRows = db.prepare('SELECT id, employee_id FROM faculty').all() as Array<{ id: number; employee_id: string }>;
    const facId: Record<string, number> = {};
    for (const f of facRows) facId[f.employee_id] = f.id;

    // 5. Courses (12 courses)
    const insertCourse = db.prepare(`
      INSERT INTO courses (code, title, department_id, program_id, semester_number, credit_hours, instructor_id, schedule_slot, room_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertCourse.run('CS-301', 'Database Systems', deptId['BS-CS'], progId['BSCS'], 5, 4, facId['FAC-ACW-002'], 'Mon / Wed 09:00-10:30', 'CS-Lab 1');
    insertCourse.run('CS-401', 'Artificial Intelligence', deptId['BS-CS'], progId['BSCS'], 7, 3, facId['FAC-ACW-001'], 'Tue / Thu 10:30-12:00', 'IQ-204');
    insertCourse.run('CS-202', 'Data Structures & Algorithms', deptId['BS-CS'], progId['BSCS'], 3, 4, facId['FAC-ACW-002'], 'Mon / Wed 11:00-12:30', 'IQ-201');
    insertCourse.run('IT-305', 'Web Engineering & Cloud Systems', deptId['BS-CS'], progId['BSIT'], 5, 3, facId['FAC-ACW-003'], 'Tue / Thu 09:00-10:30', 'CS-Lab 2');
    insertCourse.run('ECO-301', 'Econometrics & Quantitative Methods', deptId['BS-ECO'], progId['BSECO'], 5, 3, facId['FAC-ACW-004'], 'Mon / Wed 09:30-11:00', 'FJ-102');
    insertCourse.run('ECO-402', 'Microfinance & Social Policy', deptId['BS-ECO'], progId['BSECO'], 7, 3, facId['FAC-ACW-004'], 'Tue / Thu 11:30-13:00', 'FJ-104');
    insertCourse.run('ECO-201', 'Intermediate Macroeconomics', deptId['BS-ECO'], progId['BSECO'], 3, 3, facId['FAC-ACW-005'], 'Mon / Wed 12:00-13:30', 'FJ-101');
    insertCourse.run('ENG-304', 'Sociolinguistics', deptId['BS-ENG'], progId['BSENG'], 5, 3, facId['FAC-ACW-006'], 'Mon / Wed 10:00-11:30', 'FJ-203');
    insertCourse.run('ENG-203', 'South Asian Postcolonial Literature', deptId['BS-ENG'], progId['BSENG'], 3, 3, facId['FAC-ACW-007'], 'Tue / Thu 10:00-11:30', 'FJ-201');
    insertCourse.run('EDU-302', 'Curriculum Design & Evaluation', deptId['BS-EDU'], progId['BED'], 5, 3, facId['FAC-ACW-008'], 'Mon / Wed 09:00-10:30', 'SS-101');
    insertCourse.run('MGT-301', 'Social Entrepreneurship & Venture Lab', deptId['BS-MGT'], progId['BBA'], 5, 3, facId['FAC-ACW-010'], 'Tue / Thu 09:00-10:30', 'IQ-102');
    insertCourse.run('MGT-204', 'Financial Accounting for Enterprises', deptId['BS-MGT'], progId['BBA'], 3, 3, facId['FAC-ACW-011'], 'Mon / Wed 11:00-12:30', 'IQ-105');

    const courseRows = db.prepare('SELECT id, code FROM courses').all() as Array<{ id: number; code: string }>;
    const courseId: Record<string, number> = {};
    for (const c of courseRows) courseId[c.code] = c.id;

    // 6. Students (24 realistic female students across all 5 departments & batches 2023-2026)
    const studentSeedData = [
      ['STU-0001', 'ACW-2023-CS-001', 'Ayesha Bibi', 'ayesha.bibi@student.acw.edu.pk', '+92-300-4110001', deptId['BS-CS'], progId['BSCS'], 7, 2023, 'Batch 2023', 3.92, 'Active', 'Muhammad Akram', '+92-300-5110001', 'Father', 'Mohallah Dhoke Feroze, Chakwal', '37201-8472910-2', '2004-04-12'],
      ['STU-0002', 'ACW-2023-CS-002', 'Fatima Zahra', 'fatima.zahra@student.acw.edu.pk', '+92-301-4110002', deptId['BS-CS'], progId['BSCS'], 7, 2023, 'Batch 2023', 3.78, 'Active', 'Syed Tariq Abbas', '+92-301-5110002', 'Father', 'Talagang Road, Chakwal', '37201-7382910-4', '2004-07-19'],
      ['STU-0003', 'ACW-2024-CS-009', 'Hira Batool', 'hira.batool@student.acw.edu.pk', '+92-302-4110003', deptId['BS-CS'], progId['BSCS'], 5, 2024, 'Batch 2024', 3.65, 'Active', 'Zulfiqar Ali', '+92-302-5110003', 'Father', 'Balkassar, District Chakwal', '37201-9918273-6', '2005-02-08'],
      ['STU-0004', 'ACW-2024-IT-014', 'Maryam Nawazish', 'maryam.n@student.acw.edu.pk', '+92-303-4110004', deptId['BS-CS'], progId['BSIT'], 5, 2024, 'Batch 2024', 3.51, 'Active', 'Nawazish Khan', '+92-303-5110004', 'Father', 'Kallar Kahar, Chakwal', '37202-6612839-8', '2005-09-21'],
      ['STU-0005', 'ACW-2025-CS-021', 'Noor-ul-Ain', 'noor.ain@student.acw.edu.pk', '+92-304-4110005', deptId['BS-CS'], progId['BSCS'], 3, 2025, 'Batch 2025', 3.71, 'Active', 'Rashid Mahmood', '+92-304-5110005', 'Father', 'Choa Saidan Shah, Chakwal', '37203-5521908-2', '2006-01-14'],
      ['STU-0006', 'ACW-2025-IT-028', 'Sanaullah Khatoon', 'sana.khatoon@student.acw.edu.pk', '+92-305-4110006', deptId['BS-CS'], progId['BSIT'], 3, 2025, 'Batch 2025', 3.24, 'Active', 'Haji Karam Din', '+92-305-5110006', 'Father', 'Bhoun, Chakwal', '37201-4431829-0', '2006-05-30'],
      ['STU-0007', 'ACW-2026-CS-034', 'Zoya Pervaiz', 'zoya.pervaiz@student.acw.edu.pk', '+92-306-4110007', deptId['BS-CS'], progId['BSCS'], 1, 2026, 'Batch 2026', 3.45, 'Active', 'Pervaiz Akhtar', '+92-306-5110007', 'Father', 'Sargodha Road, Chakwal', '37201-1293847-2', '2007-03-17'],
      ['STU-0008', 'ACW-2023-ECO-012', 'Amina Bashir', 'amina.bashir@student.acw.edu.pk', '+92-310-4110008', deptId['BS-ECO'], progId['BSECO'], 7, 2023, 'Batch 2023', 3.88, 'Active', 'Bashir Ahmed', '+92-310-5110008', 'Father', 'Lawa, District Chakwal', '37204-8827162-4', '2004-11-02'],
      ['STU-0009', 'ACW-2024-ECO-019', 'Khadija Tul Kubra', 'khadija.k@student.acw.edu.pk', '+92-311-4110009', deptId['BS-ECO'], progId['BSECO'], 5, 2024, 'Batch 2024', 3.74, 'Active', 'Ghulam Mustafa', '+92-311-5110009', 'Father', 'Dullah, Chakwal', '37201-7712938-6', '2005-06-25'],
      ['STU-0010', 'ACW-2025-ECO-005', 'Rimsha Yasmeen', 'rimsha.y@student.acw.edu.pk', '+92-312-4110010', deptId['BS-ECO'], progId['BSECO'], 3, 2025, 'Batch 2025', 3.39, 'Active', 'Yasmeen Akhtar', '+92-312-5110010', 'Mother', 'Pindi Gujran, Chakwal', '37201-6628192-8', '2006-08-11'],
      ['STU-0011', 'ACW-2025-ECO-011', 'Sumaira Iqbal', 'sumaira.iqbal@student.acw.edu.pk', '+92-313-4110011', deptId['BS-ECO'], progId['BSECO'], 3, 2025, 'Batch 2025', 2.94, 'Probation', 'Muhammad Iqbal', '+92-313-5110011', 'Father', 'Mureed, Chakwal', '37201-5528190-4', '2006-02-19'],
      ['STU-0012', 'ACW-2026-ECO-004', 'Eman Fatima', 'eman.fatima@student.acw.edu.pk', '+92-314-4110012', deptId['BS-ECO'], progId['BSECO'], 1, 2026, 'Batch 2026', 3.60, 'Active', 'Shafqat Ali', '+92-314-5110012', 'Father', 'Chakwal City', '37201-4429182-2', '2007-04-09'],
      ['STU-0013', 'ACW-2023-ENG-004', 'Iqra Mumtaz', 'iqra.mumtaz@student.acw.edu.pk', '+92-320-4110013', deptId['BS-ENG'], progId['BSENG'], 7, 2023, 'Batch 2023', 3.95, 'Active', 'Mumtaz Hussain', '+92-320-5110013', 'Father', 'Tamman, Chakwal', '37204-3318291-0', '2004-03-22'],
      ['STU-0014', 'ACW-2024-ENG-010', 'Laiba Aurangzeb', 'laiba.a@student.acw.edu.pk', '+92-321-4110014', deptId['BS-ENG'], progId['BSENG'], 5, 2024, 'Batch 2024', 3.68, 'Active', 'Aurangzeb Khan', '+92-321-5110014', 'Father', 'Neelah, Chakwal', '37201-2291837-4', '2005-12-03'],
      ['STU-0015', 'ACW-2025-ENG-016', 'Malaika Tariq', 'malaika.t@student.acw.edu.pk', '+92-322-4110015', deptId['BS-ENG'], progId['BSENG'], 3, 2025, 'Batch 2025', 3.55, 'Active', 'Tariq Mehmood', '+92-322-5110015', 'Father', 'Pinwal, Chakwal', '37201-1182930-6', '2006-07-14'],
      ['STU-0016', 'ACW-2026-ENG-008', 'Areeba Nadeem', 'areeba.n@student.acw.edu.pk', '+92-323-4110016', deptId['BS-ENG'], progId['BSENG'], 1, 2026, 'Batch 2026', 3.41, 'Active', 'Nadeem Aslam', '+92-323-5110016', 'Father', 'Bhalla, Chakwal', '37201-9981234-8', '2007-09-05'],
      ['STU-0017', 'ACW-2023-EDU-006', 'Sadia Parveen', 'sadia.p@student.acw.edu.pk', '+92-330-4110017', deptId['BS-EDU'], progId['BED'], 7, 2023, 'Batch 2023', 3.81, 'Active', 'Khuda Bakhsh', '+92-330-5110017', 'Father', 'Chak Umra, Chakwal', '37201-8871234-2', '2004-08-18'],
      ['STU-0018', 'ACW-2024-EDU-012', 'Tehmina Asghar', 'tehmina.a@student.acw.edu.pk', '+92-331-4110018', deptId['BS-EDU'], progId['BED'], 5, 2024, 'Batch 2024', 3.49, 'Active', 'Asghar Ali', '+92-331-5110018', 'Father', 'Padshahan, Chakwal', '37201-7761234-4', '2005-05-27'],
      ['STU-0019', 'ACW-2025-EDU-018', 'Wajeeha Razzaq', 'wajeeha.r@student.acw.edu.pk', '+92-332-4110019', deptId['BS-EDU'], progId['BED'], 3, 2025, 'Batch 2025', 3.33, 'Active', 'Abdul Razzaq', '+92-332-5110019', 'Father', 'Odherwal, Chakwal', '37201-6651234-6', '2006-10-12'],
      ['STU-0020', 'ACW-2026-EDU-003', 'Hafsa Farooq', 'hafsa.f@student.acw.edu.pk', '+92-333-4110020', deptId['BS-EDU'], progId['BED'], 1, 2026, 'Batch 2026', 3.57, 'Active', 'Farooq Ahmed', '+92-333-5110020', 'Father', 'Mohallah Line Park, Chakwal', '37201-5541234-8', '2007-01-29'],
      ['STU-0021', 'ACW-2024-MGT-003', 'Saba Gulzar', 'saba.gulzar@student.acw.edu.pk', '+92-340-4110021', deptId['BS-MGT'], progId['BBA'], 5, 2024, 'Batch 2024', 3.84, 'Active', 'Gulzar Hussain', '+92-340-5110021', 'Father', 'Jhelum Road, Chakwal', '37201-4431234-0', '2005-03-07'],
      ['STU-0022', 'ACW-2024-MGT-007', 'Sidra Munir', 'sidra.munir@student.acw.edu.pk', '+92-341-4110022', deptId['BS-MGT'], progId['BBA'], 5, 2024, 'Batch 2024', 3.62, 'Active', 'Munir Ahmed', '+92-341-5110022', 'Father', 'Karsal, Chakwal', '37201-3321234-2', '2005-11-16'],
      ['STU-0023', 'ACW-2025-MGT-013', 'Nimra Ashfaq', 'nimra.a@student.acw.edu.pk', '+92-342-4110023', deptId['BS-MGT'], progId['BBA'], 3, 2025, 'Batch 2025', 3.18, 'Active', 'Ashfaq Hussain', '+92-342-5110023', 'Father', 'Balkassar, Chakwal', '37201-2211234-4', '2006-06-04'],
      ['STU-0024', 'ACW-2026-MGT-002', 'Bisma Kamran', 'bisma.k@student.acw.edu.pk', '+92-343-4110024', deptId['BS-MGT'], progId['BBA'], 1, 2026, 'Batch 2026', 3.52, 'Active', 'Kamran Khan', '+92-343-5110024', 'Father', 'Chakwal City', '37201-1101234-6', '2007-08-23'],
    ];

    const insertStudent = db.prepare(`
      INSERT INTO students (
        student_uid, registration_number, full_name, email, phone,
        department_id, program_id, current_semester, admission_year, batch_label,
        cgpa, academic_status, guardian_name, guardian_phone, guardian_relation,
        address, cnic, date_of_birth, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const s of studentSeedData) {
      insertStudent.run(...(s as (string | number)[]));
    }

    const stuRows = db.prepare('SELECT id, student_uid, department_id FROM students').all() as Array<{
      id: number;
      student_uid: string;
      department_id: number;
    }>;
    const stuId: Record<string, number> = {};
    for (const s of stuRows) stuId[s.student_uid] = s.id;

    // 7. Users (4 role-based accounts for immediate testing + authentication)
    const insertUser = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, role, department_id, linked_student_id, linked_faculty_id, avatar_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertUser.run(
      'principal@acw.edu.pk',
      hashPassword('Akhuwat@2026'),
      'Dr. Sadia Mahmood',
      'SUPER_ADMIN',
      deptId['BS-CS'],
      null,
      facId['FAC-ACW-001'],
      '/src/assets/images/avatar_principal_portrait_1795066904766.jpg',
      'Active'
    );
    insertUser.run(
      'admin@acw.edu.pk',
      hashPassword('Akhuwat@2026'),
      'Ms. Uzma Batool (Academic Admin)',
      'ADMIN',
      deptId['BS-ECO'],
      null,
      facId['FAC-ACW-005'],
      null,
      'Active'
    );
    insertUser.run(
      'teacher@acw.edu.pk',
      hashPassword('Akhuwat@2026'),
      'Ms. Zainab Qureshi',
      'TEACHER',
      deptId['BS-CS'],
      null,
      facId['FAC-ACW-002'],
      null,
      'Active'
    );
    insertUser.run(
      'student@acw.edu.pk',
      hashPassword('Akhuwat@2026'),
      'Ayesha Bibi',
      'STUDENT',
      deptId['BS-CS'],
      stuId['STU-0001'],
      null,
      null,
      'Active'
    );

    // 8. Attendance records across October & November 2026 (real calculated percentages, including low attendance cases!)
    const insertAttendance = db.prepare(`
      INSERT INTO attendance (student_id, course_id, department_id, semester_id, attendance_date, status, marked_by_user_id, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const dates = [
      '2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19',
      '2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04',
      '2026-11-09', '2026-11-11', '2026-11-16', '2026-11-18'
    ];
    const deptDefaultCourse: Record<number, number> = {
      [deptId['BS-CS']]: courseId['CS-301'],
      [deptId['BS-ECO']]: courseId['ECO-301'],
      [deptId['BS-ENG']]: courseId['ENG-304'],
      [deptId['BS-EDU']]: courseId['EDU-302'],
      [deptId['BS-MGT']]: courseId['MGT-301'],
    };

    stuRows.forEach((s, idx) => {
      const cId = deptDefaultCourse[s.department_id] ?? courseId['CS-301'];
      dates.forEach((dt, dIdx) => {
        let status: 'Present' | 'Absent' | 'Leave' | 'Late' = 'Present';
        // Make a few specific students have realistic low attendance (<75%) for alerts
        if (s.student_uid === 'STU-0006' || s.student_uid === 'STU-0011' || s.student_uid === 'STU-0023') {
          status = dIdx % 3 === 0 ? 'Present' : dIdx % 4 === 0 ? 'Leave' : 'Absent';
        } else if (s.student_uid === 'STU-0018') {
          status = dIdx % 2 === 0 ? 'Present' : 'Absent';
        } else if ((idx + dIdx) % 11 === 0) {
          status = 'Late';
        } else if ((idx + dIdx) % 13 === 0) {
          status = 'Absent';
        }
        insertAttendance.run(s.id, cId, s.department_id, semId['FALL-2026'], dt, status, 3, null);
      });
    });

    // 9. Examinations & Results
    const insertExam = db.prepare(`
      INSERT INTO examinations (title, exam_type, semester_id, department_id, exam_date, total_marks, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertExam.run('Fall 2026 Mid-Term Examination — Computing', 'Mid-Term', semId['FALL-2026'], deptId['BS-CS'], '2026-11-02', 100, 'Completed');
    insertExam.run('Fall 2026 Mid-Term Examination — Economics', 'Mid-Term', semId['FALL-2026'], deptId['BS-ECO'], '2026-11-03', 100, 'Completed');
    insertExam.run('Fall 2026 Mid-Term Examination — Humanities & Education', 'Mid-Term', semId['FALL-2026'], deptId['BS-ENG'], '2026-11-04', 100, 'Completed');
    insertExam.run('Fall 2026 Mid-Term Examination — Management', 'Mid-Term', semId['FALL-2026'], deptId['BS-MGT'], '2026-11-05', 100, 'Completed');

    const examRows = db.prepare('SELECT id FROM examinations ORDER BY id').all() as Array<{ id: number }>;

    const insertResult = db.prepare(`
      INSERT INTO results (student_id, course_id, semester_id, examination_id, marks_obtained, total_marks, grade, gpa_points, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const gradeFromMarks = (m: number): { grade: string; gpa: number; status: string } => {
      if (m >= 85) return { grade: 'A', gpa: 4.0, status: 'Passed' };
      if (m >= 80) return { grade: 'A-', gpa: 3.7, status: 'Passed' };
      if (m >= 75) return { grade: 'B+', gpa: 3.3, status: 'Passed' };
      if (m >= 70) return { grade: 'B', gpa: 3.0, status: 'Passed' };
      if (m >= 65) return { grade: 'B-', gpa: 2.7, status: 'Passed' };
      if (m >= 60) return { grade: 'C+', gpa: 2.3, status: 'Passed' };
      if (m >= 50) return { grade: 'C', gpa: 2.0, status: 'Passed' };
      return { grade: 'F', gpa: 0.0, status: 'Failed' };
    };

    const fullStuRows = db.prepare('SELECT id, department_id, cgpa FROM students').all() as Array<{
      id: number;
      department_id: number;
      cgpa: number;
    }>;

    fullStuRows.forEach((st, i) => {
      const cId = deptDefaultCourse[st.department_id] ?? courseId['CS-301'];
      const marks = Math.min(97, Math.max(54, Math.round(st.cgpa * 23 + (i % 5) - 2)));
      const g = gradeFromMarks(marks);
      const exId = examRows[0]?.id ?? null;
      insertResult.run(st.id, cId, semId['FALL-2026'], exId, marks, 100, g.grade, g.gpa, g.status);

      // Secondary Spring 2025 archived course result for historical comparison
      const marksPrev = Math.min(96, Math.max(58, marks - 2 + (i % 4)));
      const gPrev = gradeFromMarks(marksPrev);
      const secCourse = st.department_id === deptId['BS-CS'] ? courseId['CS-202'] :
        st.department_id === deptId['BS-ECO'] ? courseId['ECO-201'] :
        st.department_id === deptId['BS-ENG'] ? courseId['ENG-203'] :
        st.department_id === deptId['BS-MGT'] ? courseId['MGT-204'] : courseId['EDU-302'];
      if (secCourse !== cId) {
        insertResult.run(st.id, secCourse, semId['SPRING-2025'], exId, marksPrev, 100, gPrev.grade, gPrev.gpa, gPrev.status);
      }
    });

    // 10. Scholarships & Financial Assistance
    const insertScholarship = db.prepare(`
      INSERT INTO scholarships (code, title, provider, category, coverage_type, annual_budget_pkr, eligibility_criteria, deadline, status, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertScholarship.run('SCH-AKH-MERIT', 'Akhuwat Merit & Excellence Fellowship', 'Akhuwat Education Foundation', 'Merit-Based', '100% Tuition + Stipend', 2400000, 'CGPA >= 3.70 and Attendance >= 85%', '2026-12-15', 'Open', 'Full tuition waiver and monthly academic stipend for top-performing women scholars.');
    insertScholarship.run('SCH-AKH-NEED', 'Akhuwat Mawakhat Fee-Free Grant', 'Akhuwat Foundation Pakistan', 'Need-Based', '100% Fee Waiver', 4500000, 'Verified household income below PKR 55,000/month and regular academic standing', '2026-12-30', 'Open', 'Zero-interest and fee-free empowerment support under the Akhuwat Mawakhat solidarity model.');
    insertScholarship.run('SCH-PEEF-2026', 'PEEF Punjab Educational Endowment', 'Government of Punjab (PEEF)', 'Provincial Endowment', 'Tuition + PKR 60,000/yr', 1800000, 'Domicile Chakwal/Punjab, >= 75% previous board/semester score', '2026-11-30', 'Open', 'Provincial merit-cum-need endowment supporting undergraduate women.');
    insertScholarship.run('SCH-HEC-STEM', 'Women in STEM Innovation Bursary', 'Higher Education Support Wing', 'STEM Research', '50% Tuition + Lab Grant', 950000, 'Enrolled in BSCS/BSIT with active research or FYP prototype', '2026-12-10', 'Open', 'Encourages computing and applied sciences research among Chakwal female scholars.');

    const schRows = db.prepare('SELECT id, code FROM scholarships').all() as Array<{ id: number; code: string }>;
    const schId: Record<string, number> = {};
    for (const s of schRows) schId[s.code] = s.id;

    const insertFin = db.prepare(`
      INSERT INTO financial_assistance (student_id, scholarship_id, academic_year, assistance_type, amount_pkr, fee_concession_pct, application_status, approved_by, disbursement_date, remarks, is_confidential, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertFin.run(stuId['STU-0001'], schId['SCH-AKH-MERIT'], '2026-2027', 'Merit Scholarship', 120000, 100, 'Disbursed', 'Dr. Sadia Mahmood', '2026-09-25', 'Top CGPA in Computing Department', 1);
    insertFin.run(stuId['STU-0008'], schId['SCH-AKH-MERIT'], '2026-2027', 'Merit Scholarship', 120000, 100, 'Disbursed', 'Dr. Sadia Mahmood', '2026-09-25', 'First position BS Economics Batch 2023', 1);
    insertFin.run(stuId['STU-0013'], schId['SCH-AKH-MERIT'], '2026-2027', 'Merit Scholarship', 120000, 100, 'Approved', 'Dr. Sadia Mahmood', null, 'Dean Honor Roll distinction', 1);
    insertFin.run(stuId['STU-0003'], schId['SCH-AKH-NEED'], '2026-2027', 'Fee Concession', 85000, 100, 'Disbursed', 'Scholarship Committee', '2026-10-02', 'Full Mawakhat fee support approved', 1);
    insertFin.run(stuId['STU-0005'], schId['SCH-HEC-STEM'], '2026-2027', 'STEM Bursary', 65000, 50, 'Approved', 'Dr. Sadia Mahmood', null, 'AI Campus Innovation lab grant', 1);
    insertFin.run(stuId['STU-0009'], schId['SCH-PEEF-2026'], '2026-2027', 'Endowment Grant', 90000, 75, 'Disbursed', 'PEEF & Principal', '2026-10-15', 'Verified Chakwal rural household support', 1);
    insertFin.run(stuId['STU-0017'], schId['SCH-AKH-NEED'], '2026-2027', 'Fee Concession', 85000, 100, 'Disbursed', 'Scholarship Committee', '2026-09-28', 'Full tuition waiver', 1);
    insertFin.run(stuId['STU-0021'], schId['SCH-AKH-MERIT'], '2026-2027', 'Merit Scholarship', 110000, 100, 'Approved', 'Dr. Sadia Mahmood', null, 'Social Enterprise leadership grant', 1);
    insertFin.run(stuId['STU-0010'], schId['SCH-AKH-NEED'], '2026-2027', 'Financial Aid', 45000, 50, 'Under Review', null, null, 'Pending guardian income verification', 1);
    insertFin.run(stuId['STU-0019'], schId['SCH-PEEF-2026'], '2026-2027', 'Endowment Grant', 60000, 50, 'Pending', null, null, 'Application submitted Nov 2026', 1);

    // 11. Events, Workshops & Activities (all 7 categories represented!)
    const insertEvent = db.prepare(`
      INSERT INTO events (title, category, event_date, venue, organizer, department_id, guest_speakers, description, outcomes, cover_image_url, status, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertEvent.run('Women in Tech & Digital Entrepreneurship Forum', 'Entrepreneurship sessions', '2026-10-18', 'Main Auditorium, Chakwal Campus', 'Department of Management & CS', deptId['BS-MGT'], 'Dr. Amjad Saqib (Keynote), Ms. Jehan Ara', 'Flagship symposium empowering female undergraduates to build social enterprises and tech startups from Chakwal.', '14 student venture pitches shortlisted; 3 micro-incubation seed grants awarded.', '/src/assets/images/event_workshop_seminar_1795066904790.jpg', 'Completed');
    insertEvent.run('Applied AI & Python Data Science Bootcamp', 'Workshops', '2026-10-29', 'Computer Science Lab 1 & 2', 'BS Computer Science Society', deptId['BS-CS'], 'Dr. Sadia Mahmood, Eng. Tariq Mehmood (NUST)', 'Two-day hands-on workshop on data pipelines, machine learning workflows, and ethical AI.', '68 students trained and certified in Python pandas & exploratory analytics.', '/src/assets/images/event_workshop_seminar_1795066904790.jpg', 'Completed');
    insertEvent.run('Annual Academic Convocation & Merit Awards', 'Academic events', '2026-09-20', 'Central Courtyard Lawn', 'Office of the Principal', null, 'Board of Governors, Akhuwat Foundation', 'Annual celebration honoring graduating batches, Gold Medalists, and Dean Honor Roll recipients.', '42 degrees conferred and 18 merit shields presented.', '/src/assets/images/archive_convocation_photo_1795066904201.jpg', 'Completed');
    insertEvent.run('Potohar Economic Policy & Microfinance Seminar', 'Seminars', '2026-11-06', 'Fatima Jinnah Seminar Hall', 'Department of Economics', deptId['BS-ECO'], 'Dr. Lubna Shahnaz (PIDE)', 'Research seminar examining interest-free microfinance outcomes in rural Chakwal households.', 'Published 6 undergraduate policy briefs in the College Research Digest.', null, 'Completed');
    insertEvent.run('All-Punjab Inter-Collegiate Qiraat & Debate Olympiad', 'Competitions', '2026-11-12', 'Main Auditorium', 'Literary & Debating Society', deptId['BS-ENG'], 'Prof. Humaira Anwar (Panel Judge)', 'Bilingual parliamentary debate and literary declamation competition across 9 regional women colleges.', 'ACW Chakwal secured 1st Runner-Up Trophy and Best Speaker Gold Medal.', null, 'Completed');
    insertEvent.run('Mawakhat Winter Warmth & Community Blood Drive', 'Social activities', '2026-11-28', 'Campus Courtyard & Chakwal THQ', 'Akhuwat Volunteer Corps', deptId['BS-EDU'], 'Dr. Kamran Malik (THQ Chakwal)', 'Student-led community solidarity drive distributing winter kits and organizing health awareness.', 'Target: 250 winter packages for rural families.', null, 'Upcoming');
    insertEvent.run('Career Readiness, CV Clinic & Fellowship Prep', 'Career development sessions', '2026-12-04', 'Allama Iqbal Seminar Room', 'Career Placement Office', deptId['BS-MGT'], 'Ms. Rabia Tariq, HR Leads from Islamabad', 'Mock interviews, LinkedIn optimization, and Fulbright/Commonwealth scholarship preparation.', 'Open to all Semester 5 and Semester 7 students.', null, 'Upcoming');

    const evtRows = db.prepare('SELECT id, title FROM events').all() as Array<{ id: number; title: string }>;
    const insertPart = db.prepare(`
      INSERT INTO event_participants (event_id, student_id, faculty_id, participant_name, role, certificate_issued)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    if (evtRows[0]) {
      insertPart.run(evtRows[0].id, stuId['STU-0021'], null, 'Saba Gulzar', 'Lead Presenter', 1);
      insertPart.run(evtRows[0].id, stuId['STU-0001'], null, 'Ayesha Bibi', 'Tech Lead', 1);
      insertPart.run(evtRows[0].id, stuId['STU-0008'], null, 'Amina Bashir', 'Participant', 1);
    }
    if (evtRows[1]) {
      insertPart.run(evtRows[1].id, stuId['STU-0001'], null, 'Ayesha Bibi', 'Workshop Coordinator', 1);
      insertPart.run(evtRows[1].id, stuId['STU-0002'], null, 'Fatima Zahra', 'Participant', 1);
      insertPart.run(evtRows[1].id, stuId['STU-0003'], null, 'Hira Batool', 'Participant', 1);
      insertPart.run(evtRows[1].id, stuId['STU-0004'], null, 'Maryam Nawazish', 'Participant', 1);
    }
    if (evtRows[4]) {
      insertPart.run(evtRows[4].id, stuId['STU-0013'], null, 'Iqra Mumtaz', 'Gold Medalist Speaker', 1);
      insertPart.run(evtRows[4].id, stuId['STU-0014'], null, 'Laiba Aurangzeb', 'Participant', 1);
    }

    // 12. Student Achievements & Certificates
    const insertAch = db.prepare(`
      INSERT INTO achievements (student_id, title, category, level, achievement_date, issuing_organization, description, certificate_url, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertAch.run(stuId['STU-0001'], '1st Position — National Women Hackathon Islamabad', 'Competitions', 'National', '2026-10-10', 'IGNITE National Technology Fund', 'Built an offline Urdu maternal literacy companion prototype.', null);
    insertAch.run(stuId['STU-0001'], 'Dean Honor Roll & Academic Gold Medal', 'Academic', 'College', '2026-09-20', 'Akhuwat College for Women, Chakwal', 'Maintained highest CGPA (3.92) across Computing cohort.', null);
    insertAch.run(stuId['STU-0001'], 'AWS Cloud Practitioner Certification', 'Certifications', 'International', '2026-08-14', 'Amazon Web Services', 'Verified foundational cloud architecture certification.', null);
    insertAch.run(stuId['STU-0013'], 'Best English Parliamentary Debater Trophy', 'Competitions', 'Regional', '2026-11-12', 'Punjab Higher Education Debating Council', 'Winner among 28 regional women collegiate speakers.', null);
    insertAch.run(stuId['STU-0013'], 'Published Research Paper on Chakwal Bilingualism', 'Research', 'National', '2026-06-18', 'Journal of Pakistani Applied Linguistics', 'Co-authored empirical sociolinguistics study with Dr. Hina Zafar.', null);
    insertAch.run(stuId['STU-0008'], 'Summer Research Internship — PIDE Islamabad', 'Internships', 'National', '2026-08-30', 'Pakistan Institute of Development Economics', 'Eight-week research internship on rural women microenterprise.', null);
    insertAch.run(stuId['STU-0021'], 'Potohar Women Craft Collective — Seed Winner', 'Entrepreneurship', 'Regional', '2026-10-18', 'Akhuwat Entrepreneurship Cell', 'Social venture connecting 40 Chakwal artisans to digital marketplaces.', null);
    insertAch.run(stuId['STU-0017'], 'Community Literacy Volunteer — 120 Hours', 'Community service', 'College', '2026-09-05', 'Akhuwat Mawakhat Outreach', 'Taught foundational numeracy and reading to 35 out-of-school girls.', null);
    insertAch.run(stuId['STU-0002'], 'President, ACW Computing Society', 'Leadership', 'College', '2026-09-10', 'Student Affairs Directorate', 'Led peer coding mentorship for 90 first-year students.', null);
    insertAch.run(stuId['STU-0014'], 'Inter-Collegiate Badminton Silver Medalist', 'Sports', 'Regional', '2026-10-24', 'Rawalpindi Division Sports Board', 'Singles silver medal at Women Inter-College Games.', null);

    const insertCert = db.prepare(`
      INSERT INTO certificates (student_id, certificate_code, title, issued_by, issue_date, category, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCert.run(stuId['STU-0001'], 'CERT-ACW-2026-001', 'Dean Honor Roll Academic Excellence', 'Office of the Principal, ACW Chakwal', '2026-09-20', 'Academic', 1);
    insertCert.run(stuId['STU-0001'], 'CERT-ACW-2026-002', 'Applied AI & Python Data Science Bootcamp', 'Department of Computer Science', '2026-10-29', 'Workshop', 1);
    insertCert.run(stuId['STU-0013'], 'CERT-ACW-2026-003', 'Gold Medal — Parliamentary Debate Olympiad', 'Literary & Debating Society', '2026-11-12', 'Competition', 1);
    insertCert.run(stuId['STU-0008'], 'CERT-ACW-2026-004', 'Economic Policy Research Fellowship', 'PIDE & Department of Economics', '2026-08-30', 'Research', 1);

    // 13. Digital Archive Documents
    const insertArchive = db.prepare(`
      INSERT INTO archive_documents (title, folder, category, year_label, description, file_url, file_name, file_type, uploaded_by, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertArchive.run('Founding Charter & Campus Inauguration Monograph (2018)', 'Institutional Heritage', 'College history', '2018', 'Historical record of the establishment of Akhuwat College for Women, Chakwal under the fee-free Mawakhat vision.', '/assets/aistudio/image_1b288e46.png', 'chakwal_campus_charter_2018.png', 'image/png', 1);
    insertArchive.run('Annual Institutional Report 2025-2026', 'Annual Reports', 'Annual reports', '2025-2026', 'Comprehensive institutional audit covering graduation outcomes, scholarship disbursements, and research publications.', null, 'ACW_Annual_Report_2025_2026.pdf', 'application/pdf', 1);
    insertArchive.run('Batch 2022–2026 Convocation Album', 'Convocations & Batches', 'Previous batches', '2026', 'Official convocation gallery and graduating cohort directory for Chakwal campus.', '/src/assets/images/archive_convocation_photo_1795066904201.jpg', 'convocation_2026.jpg', 'image/jpeg', 1);
    insertArchive.run('Women Entrepreneurship Forum Photographic Record', 'Events & Memories', 'Event memories', '2026', 'Documentary capture of student founders and keynote guests at the October 2026 forum.', '/src/assets/images/event_workshop_seminar_1795066904790.jpg', 'entrepreneurship_forum_2026.jpg', 'image/jpeg', 1);
    insertArchive.run('Official Institutional Crest & Brand Standards', 'Governance Documents', 'Important documents', '2026', 'Authorized high-resolution institutional emblem and academic seal guidelines.', '/src/assets/images/crest_akhuwat_brain_1795066904297.jpg', 'acw_institutional_crest.jpg', 'image/jpeg', 1);
    insertArchive.run('The Chakwal Crescent — Literary & Research Journal Vol. 6', 'Publications', 'College publications', '2026', 'Biannual student and faculty research compendium edited by the Department of English.', null, 'Chakwal_Crescent_Vol6.pdf', 'application/pdf', 2);

    // 14. College Resources & Inventory
    const insertResource = db.prepare(`
      INSERT INTO resources (resource_code, name, category, location, department_id, quantity, available_quantity, condition_status, last_maintenance_date, next_maintenance_date, maintenance_notes, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertResource.run('RES-LAB-01', 'Computing Lab 1 — Workstations (Core i7)', 'Computers', 'Allama Iqbal Block, Room 202', deptId['BS-CS'], 40, 38, 'Operational', '2026-10-01', '2027-01-15', '2 systems undergoing SSD upgrade');
    insertResource.run('RES-LAB-02', 'Computing Lab 2 — Networking & AI Lab', 'Laboratories', 'Allama Iqbal Block, Room 205', deptId['BS-CS'], 32, 32, 'Operational', '2026-10-12', '2027-02-01', 'All workstations calibrated for Fall 2026');
    insertResource.run('RES-CLS-01', 'Smart Lecture Hall IQ-201', 'Classrooms', 'Allama Iqbal Block, Floor 2', null, 60, 60, 'Operational', '2026-09-01', '2027-03-01', 'Multimedia projector & acoustic system verified');
    insertResource.run('RES-CLS-02', 'Fatima Jinnah Seminar Hall', 'Classrooms', 'Fatima Jinnah Block, Floor 1', deptId['BS-ECO'], 120, 120, 'Operational', '2026-09-05', '2027-03-05', 'Audio podium serviced');
    insertResource.run('RES-LIB-01', 'Central Library Academic Book Collection', 'Library books', 'Central Library Wing', null, 14850, 14210, 'Operational', '2026-08-20', '2027-01-20', '640 volumes currently checked out by students');
    insertResource.run('RES-EQP-01', 'Solar Inverter & Backup Power Array (40 kVA)', 'Equipment', 'Campus Utility Annex', null, 2, 1, 'Needs Maintenance', '2026-07-15', '2026-11-25', 'Inverter Unit B battery bank inspection scheduled');
    insertResource.run('RES-FUR-01', 'Ergonomic Student Desk & Chair Sets', 'Furniture', 'Sir Syed Academic Wing', deptId['BS-EDU'], 180, 174, 'Operational', '2026-08-25', '2027-02-25', '6 units sent for carpentry polish');
    insertResource.run('RES-OFF-01', 'High-Speed Institutional Laser Printers', 'Office resources', 'Admin & Examination Cell', null, 6, 6, 'Operational', '2026-10-20', '2027-01-20', 'Toner cartridges stocked');

    const resRows = db.prepare('SELECT id, resource_code FROM resources').all() as Array<{ id: number; resource_code: string }>;
    const insertInv = db.prepare(`
      INSERT INTO inventory (item_sku, item_name, resource_id, category, unit_count, location, assigned_to, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertInv.run('INV-DEL-401', 'Dell OptiPlex 7010 Workstations', resRows[0]?.id ?? null, 'Computers', 40, 'CS Lab 1', 'Ms. Bushra Ilyas', 'Deployed');
    insertInv.run('INV-PRJ-104', 'Epson EB-X51 Classroom Projectors', resRows[2]?.id ?? null, 'Equipment', 12, 'Academic Blocks', 'IT Support Desk', 'Deployed');
    insertInv.run('INV-BKS-901', 'HEC Prescribed Economics & CS Textbooks', resRows[4]?.id ?? null, 'Library books', 3200, 'Central Library', 'Chief Librarian', 'Cataloged');

    // 15. Announcements & Academic Calendar
    const insertAnn = db.prepare(`
      INSERT INTO announcements (title, body, category, target_role, priority, event_date, created_by, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertAnn.run('Fall 2026 Scholarship & Fee Concession Verification Window', 'Students applying for Mawakhat Fee-Free Grants or PEEF Endowment renewals for 2026-2027 must submit verified income affidavits to the Financial Aid Cell before December 15, 2026.', 'Scholarship', 'ALL', 'Important', '2026-12-15', 1);
    insertAnn.run('Mid-Term Attendance Review & 75% Threshold Advisory', 'Department coordinators have published mid-semester attendance records. Students below 75% attendance must meet their Semester Advisor immediately.', 'Attendance', 'ALL', 'Urgent', '2026-11-22', 2);
    insertAnn.run('Mawakhat Winter Warmth & Blood Drive — Volunteer Registration', 'Join the Akhuwat Volunteer Corps on November 28 in the Campus Courtyard to pack winter kits for rural Chakwal households.', 'Events', 'ALL', 'Normal', '2026-11-28', 2);
    insertAnn.run('Faculty Board of Studies Curriculum Review Meeting', 'All Heads of Departments and Course Instructors are requested to upload Fall 2026 course portfolios prior to the November 30 Academic Council review.', 'Academic', 'TEACHER', 'Important', '2026-11-30', 1);

    const insertCal = db.prepare(`
      INSERT INTO academic_calendar (title, event_type, start_date, end_date, semester_id, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertCal.run('Fall 2026 Classes Commencement', 'Semester Start', '2026-09-07', '2026-09-07', semId['FALL-2026'], 'Orientation and regular classes begin across all undergraduate programs.');
    insertCal.run('Mid-Term Examination Week', 'Examinations', '2026-11-02', '2026-11-07', semId['FALL-2026'], 'Mid-term written and lab assessments.');
    insertCal.run('Mawakhat Winter Solidarity Drive', 'Campus Activity', '2026-11-28', '2026-11-28', semId['FALL-2026'], 'College-wide community outreach event.');
    insertCal.run('Final Term Examinations', 'Examinations', '2027-01-11', '2027-01-22', semId['FALL-2026'], 'Comprehensive final semester examinations.');

    // 16. Initial Audit Log
    db.prepare(`
      INSERT INTO audit_logs (user_id, user_email, user_role, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'principal@acw.edu.pk', 'SUPER_ADMIN', 'SYSTEM_INITIALIZED', 'database', 'schema_v1', 'Initialized Akhuwat Campus Brain institutional relational database for Chakwal campus.');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Seed error:', err);
    throw err;
  }
}
