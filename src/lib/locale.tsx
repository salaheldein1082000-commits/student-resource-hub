/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "ar";

type MessageKey =
  | "dashboard"
  | "resources"
  | "assignments"
  | "submissions"
  | "classes"
  | "importStudents"
  | "announcements"
  | "feedbackBank"
  | "manage"
  | "unitLeader"
  | "engineer"
  | "student"
  | "signOut"
  | "switchLanguage"
  | "hello"
  | "yourAssignments"
  | "noAssignments"
  | "notSubmitted"
  | "submitted"
  | "graded"
  | "resubmissionAllowed"
  | "downloadBrief"
  | "uploadReport"
  | "fileLimit"
  | "criteria"
  | "achieved"
  | "comments"
  | "generalComments"
  | "saveDraft"
  | "publishFeedback"
  | "allowResubmission"
  | "assignment"
  | "class"
  | "status"
  | "all"
  | "students"
  | "engineers"
  | "capacity"
  | "enrollment"
  | "unassigned"
  | "rename"
  | "upload"
  | "preview"
  | "feedback"
  | "search"
  | "filterAssignment"
  | "filterClass"
  | "filterStatus"
  | "due"
  | "attempt"
  | "noSubmissions"
  | "createAssignment"
  | "save"
  | "cancel"
  | "title"
  | "part"
  | "of"
  | "brief"
  | "selectClasses"
  | "pdfOrDocx"
  | "noDeadline"
  | "attemptHistory"
  | "tryAgain"
  | "loading"
  | "exportPdf";

const messages: Record<Locale, Record<MessageKey, string>> = {
  en: {
    dashboard: "Dashboard",
    resources: "Resources",
    assignments: "Assignments",
    submissions: "Submissions",
    classes: "Classes",
    importStudents: "Import students",
    announcements: "Announcements",
    feedbackBank: "Feedback bank",
    manage: "Manage",
    unitLeader: "Unit Leader",
    engineer: "Engineer",
    student: "Student",
    signOut: "Sign out",
    switchLanguage: "العربية",
    hello: "Hello",
    yourAssignments: "Your assignments",
    noAssignments: "No assignments yet.",
    notSubmitted: "Not submitted",
    submitted: "Submitted",
    graded: "Graded",
    resubmissionAllowed: "Resubmission allowed",
    downloadBrief: "Download brief",
    uploadReport: "Upload report",
    fileLimit: "PDF or DOCX, up to 20 MB",
    criteria: "Criteria",
    achieved: "Achieved",
    comments: "Comments",
    generalComments: "General comments",
    saveDraft: "Save draft",
    publishFeedback: "Publish feedback",
    allowResubmission: "Allow resubmission",
    assignment: "Assignment",
    class: "Class",
    status: "Status",
    all: "All",
    students: "Students",
    engineers: "Engineers",
    capacity: "Capacity",
    enrollment: "Enrolled",
    unassigned: "Unassigned",
    rename: "Rename",
    upload: "Upload",
    preview: "Preview",
    feedback: "Feedback",
    search: "Search",
    filterAssignment: "Filter by assignment",
    filterClass: "Filter by class",
    filterStatus: "Filter by status",
    due: "Due",
    attempt: "Attempt",
    noSubmissions: "No submissions yet.",
    createAssignment: "Create assignment",
    save: "Save",
    cancel: "Cancel",
    title: "Title",
    part: "Part",
    of: "of",
    brief: "Brief",
    selectClasses: "Select classes",
    pdfOrDocx: "PDF or DOCX file",
    noDeadline: "No deadline",
    attemptHistory: "Attempt history",
    tryAgain: "Try again",
    loading: "Loading…",
    exportPdf: "Print / Save as PDF",
  },
  ar: {
    dashboard: "لوحة التحكم",
    resources: "المصادر",
    assignments: "التكليفات",
    submissions: "التسليمات",
    classes: "الفصول",
    importStudents: "استيراد الطلاب",
    announcements: "الإعلانات",
    feedbackBank: "بنك الملاحظات",
    manage: "إدارة",
    unitLeader: "قائد الوحدة",
    engineer: "المهندس",
    student: "الطالب",
    signOut: "تسجيل الخروج",
    switchLanguage: "English",
    hello: "مرحباً",
    yourAssignments: "تكليفاتك",
    noAssignments: "لا توجد تكليفات بعد.",
    notSubmitted: "لم يتم التسليم",
    submitted: "تم التسليم",
    graded: "تم التقييم",
    resubmissionAllowed: "إعادة التسليم مسموحة",
    downloadBrief: "تنزيل موجز التكليف",
    uploadReport: "رفع التقرير",
    fileLimit: "PDF أو DOCX، حتى 20 ميجابايت",
    criteria: "المعايير",
    achieved: "محقق",
    comments: "الملاحظات",
    generalComments: "ملاحظات عامة",
    saveDraft: "حفظ كمسودة",
    publishFeedback: "نشر الملاحظات",
    allowResubmission: "السماح بإعادة التسليم",
    assignment: "التكليف",
    class: "الفصل",
    status: "الحالة",
    all: "الكل",
    students: "الطلاب",
    engineers: "المهندسون",
    capacity: "السعة",
    enrollment: "عدد المسجلين",
    unassigned: "غير معيّن",
    rename: "إعادة تسمية",
    upload: "رفع",
    preview: "معاينة",
    feedback: "الملاحظات",
    search: "بحث",
    filterAssignment: "تصفية حسب التكليف",
    filterClass: "تصفية حسب الفصل",
    filterStatus: "تصفية حسب الحالة",
    due: "موعد التسليم",
    attempt: "المحاولة",
    noSubmissions: "لا توجد تسليمات بعد.",
    createAssignment: "إنشاء تكليف",
    save: "حفظ",
    cancel: "إلغاء",
    title: "العنوان",
    part: "الجزء",
    of: "من",
    brief: "الموجز",
    selectClasses: "اختر الفصول",
    pdfOrDocx: "ملف PDF أو DOCX",
    noDeadline: "لا يوجد موعد نهائي",
    attemptHistory: "سجل المحاولات",
    tryAgain: "حاول مرة أخرى",
    loading: "جارٍ التحميل…",
    exportPdf: "طباعة / حفظ كملف PDF",
  },
};

type LocaleContextValue = {
  locale: Locale;
  direction: "ltr" | "rtl";
  t: (key: MessageKey) => string;
  toggleLocale: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("btec-locale");
    if (saved === "ar" || saved === "en") setLocale(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem("btec-locale", locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      t: (key) => messages[locale][key],
      toggleLocale: () => setLocale((current) => (current === "en" ? "ar" : "en")),
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}
