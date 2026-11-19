export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT';

export type ModuleKey =
  | 'overview'
  | 'students'
  | 'faculty'
  | 'academics'
  | 'attendance'
  | 'departments'
  | 'scholarships'
  | 'finance'
  | 'events'
  | 'achievements'
  | 'resources'
  | 'archive'
  | 'ai'
  | 'analytics'
  | 'settings';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: number | null;
  linked_student_id: number | null;
  linked_faculty_id: number | null;
  avatar_url: string | null;
  status: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  head_name: string | null;
  description: string | null;
  established_year: number | null;
  building_location: string | null;
  student_count?: number;
  faculty_count?: number;
  program_count?: number;
  course_count?: number;
  avg_cgpa?: number | null;
}

export interface Program {
  id: number;
  code: string;
  name: string;
  department_id: number;
  department_code?: string;
  department_name?: string;
  degree_level: string;
  duration_years: number;
  total_semesters: number;
  credit_hours: number;
  status: string;
}

export interface Semester {
  id: number;
  code: string;
  name: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  is_current: number;
}

export interface Student {
  id: number;
  student_uid: string;
  registration_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  department_id: number;
  department_code?: string;
  department_name?: string;
  program_id: number | null;
  program_code?: string;
  program_name?: string;
  current_semester: number;
  admission_year: number;
  batch_label: string;
  cgpa: number | null;
  academic_status: string;
  guardian_name: string;
  guardian_phone: string | null;
  guardian_relation: string | null;
  address: string | null;
  cnic?: string | null;
  date_of_birth: string | null;
  attendance_pct?: number | null;
  is_demo?: number;
  created_at?: string;
}

export interface Faculty {
  id: number;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  department_id: number;
  department_code?: string;
  department_name?: string;
  designation: string;
  qualification: string;
  specialization: string | null;
  subjects_taught: string | null;
  experience_years: number;
  joining_date: string;
  responsibilities: string | null;
  status: string;
  is_demo?: number;
}

export interface Course {
  id: number;
  code: string;
  title: string;
  department_id: number;
  department_code?: string;
  department_name?: string;
  program_id: number | null;
  program_code?: string;
  semester_number: number;
  credit_hours: number;
  instructor_id: number | null;
  instructor_name?: string | null;
  schedule_slot: string | null;
  room_number: string | null;
}

export interface ExamResult {
  id: number;
  student_id: number;
  registration_number?: string;
  student_name?: string;
  course_id: number;
  course_code?: string;
  course_title?: string;
  semester_id: number;
  semester_name?: string;
  department_code?: string;
  marks_obtained: number;
  total_marks: number;
  grade: string;
  gpa_points: number;
  status: string;
}

export interface ScholarshipProgram {
  id: number;
  code: string;
  title: string;
  provider: string;
  category: string;
  coverage_type: string;
  annual_budget_pkr: number;
  eligibility_criteria: string;
  deadline: string | null;
  status: string;
  description: string | null;
}

export interface FinancialAssistance {
  id: number;
  student_id: number;
  registration_number?: string;
  student_name?: string;
  department_code?: string;
  scholarship_id: number | null;
  scholarship_title?: string | null;
  scholarship_code?: string | null;
  academic_year: string;
  assistance_type: string;
  amount_pkr: number;
  fee_concession_pct: number;
  application_status: 'Pending' | 'Under Review' | 'Approved' | 'Disbursed' | 'Rejected';
  approved_by: string | null;
  disbursement_date: string | null;
  remarks: string | null;
  created_at: string;
}

export interface CampusEvent {
  id: number;
  title: string;
  category: string;
  event_date: string;
  venue: string;
  organizer: string;
  department_id: number | null;
  department_code?: string;
  guest_speakers: string | null;
  description: string | null;
  outcomes: string | null;
  cover_image_url: string | null;
  status: string;
  participant_count?: number;
}

export interface Achievement {
  id: number;
  student_id: number;
  student_name?: string;
  registration_number?: string;
  department_code?: string;
  title: string;
  category: string;
  level: string;
  achievement_date: string;
  issuing_organization: string;
  description: string | null;
  certificate_url: string | null;
}

export interface ArchiveDocument {
  id: number;
  title: string;
  folder: string;
  category: string;
  year_label: string;
  description: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  uploaded_by_name?: string;
  created_at: string;
}

export interface CampusResource {
  id: number;
  resource_code: string;
  name: string;
  category: string;
  location: string;
  department_id: number | null;
  department_code?: string;
  quantity: number;
  available_quantity: number;
  condition_status: string;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  maintenance_notes: string | null;
}

export interface AiQueryResult {
  answer: string;
  dataPeriod: string;
  sources: string[];
  chart?: {
    type: 'bar' | 'line' | 'pie';
    title: string;
    xKey: string;
    yKey: string;
    yLabel?: string;
    data: Array<Record<string, string | number>>;
  };
  table?: {
    title: string;
    columns: string[];
    rows: Array<Array<string | number | null>>;
  };
  toolsUsed: string[];
}
