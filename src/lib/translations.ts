/**
 * translations.ts
 * Two-language string table for Hair Tech Salon.
 * Hindi uses simple Hinglish (romanised + everyday words, not formal Hindi).
 * Keep keys flat and descriptive so usage is self-documenting.
 */

export type Lang = 'en' | 'hi';

const T = {
  // ── Language toggle ──────────────────────────────────────────────────────
  langLabel:         { en: 'हिंदी',       hi: 'English' },
  langSwitch:        { en: 'Switch to Hindi', hi: 'Switch to English' },

  // ── Common actions ───────────────────────────────────────────────────────
  next:              { en: 'Next',         hi: 'Aage' },
  back:              { en: 'Back',         hi: 'Peeche' },
  close:             { en: 'Close',        hi: 'Band karo' },
  confirm:           { en: 'Confirm',      hi: 'Pakka karo' },
  save:              { en: 'Save',         hi: 'Save karo' },
  done:              { en: 'Done',         hi: 'Ho gaya!' },
  add:               { en: 'Add',          hi: 'Add' },
  remove:            { en: 'Remove',       hi: 'Hatao' },
  search:            { en: 'Search',       hi: 'Khojiye' },
  loading:           { en: 'Loading…',     hi: 'Aa raha hai…' },
  noResults:         { en: 'Nothing found', hi: 'Kuch nahi mila' },
  optional:          { en: 'optional',     hi: 'zaroori nahi' },
  signOut:           { en: 'Sign Out',     hi: 'Bahar jao' },

  // ── Status labels ────────────────────────────────────────────────────────
  statusConfirmed:   { en: 'Confirmed',    hi: 'Pakka' },
  statusPaid:        { en: 'Paid',         hi: 'Pay ho gaya' },
  statusPending:     { en: 'Pending',      hi: 'Baaki' },
  statusCancelled:   { en: 'Cancelled',    hi: 'Radd' },
  statusCompleted:   { en: 'Completed',    hi: 'Khatam' },

  // ── Time of day ──────────────────────────────────────────────────────────
  morning:           { en: 'Morning',      hi: 'Subah' },
  afternoon:         { en: 'Afternoon',    hi: 'Dopahar' },
  evening:           { en: 'Evening',      hi: 'Shaam' },
  goodMorning:       { en: 'Good Morning', hi: 'Suprabhat!' },
  goodAfternoon:     { en: 'Good Afternoon', hi: 'Namaskaar!' },
  goodEvening:       { en: 'Good Evening', hi: 'Shubh Shaam!' },

  // ── Customer ─────────────────────────────────────────────────────────────
  customer:          { en: 'Customer',     hi: 'Grahak' },
  customerName:      { en: 'Customer name', hi: 'Grahak ka naam' },
  customerPhone:     { en: 'Phone number', hi: 'Mobile number' },
  searchCustomer:    { en: 'Search by name or phone…', hi: 'Naam ya mobile type karo…' },
  newCustomer:       { en: 'New customer', hi: 'Naya grahak' },
  addNewCustomer:    { en: 'Add new customer', hi: 'Naya grahak add karo' },
  noCustomerFound:   { en: 'No customer found', hi: 'Grahak nahi mila' },
  recentCustomers:   { en: 'Recent customers', hi: 'Pichle grahak' },
  typeToSearch:      { en: 'Type 3+ characters to search', hi: '3 letter type karo' },
  phoneHint:         { en: 'Type phone or name — auto-suggests', hi: 'Phone ya naam likhiye — khud dhundh lega' },
  enterName:         { en: 'Enter customer name', hi: 'Naam likhiye' },
  createAndContinue: { en: 'Create & Continue', hi: 'Banao aur Aage jao' },
  visitCount:        { en: 'visits',       hi: 'baar aaye' },

  // ── Services ─────────────────────────────────────────────────────────────
  services:          { en: 'Services',     hi: 'Kaam' },
  selectServices:    { en: 'Select services', hi: 'Kaam chuniye' },
  searchServices:    { en: 'Search services…', hi: 'Kaam khojiye…' },
  addToBill:         { en: 'Add',          hi: 'Add' },
  noServiceSelected: { en: 'No services selected yet', hi: 'Abhi koi kaam select nahi kiya' },
  selectedServices:  { en: 'Selected',     hi: 'Select kiye gaye' },
  allCategories:     { en: 'All',          hi: 'Sab' },

  // ── Staff ────────────────────────────────────────────────────────────────
  staff:             { en: 'Staff',        hi: 'Staff' },
  assignStaff:       { en: 'Assign staff', hi: 'Staff chuniye' },
  selectStaff:       { en: 'Select staff member', hi: 'Staff ka naam chuniye' },
  noStaff:           { en: 'No staff assigned', hi: 'Koi staff nahi chuna' },

  // ── Payment (billing) ────────────────────────────────────────────────────
  payment:           { en: 'Payment',      hi: 'Bhugtaan' },
  paymentMethod:     { en: 'How are they paying?', hi: 'Paise kaise de rahe hain?' },
  cash:              { en: 'Cash',         hi: 'Naqad' },
  upi:               { en: 'UPI',          hi: 'UPI' },
  card:              { en: 'Card',         hi: 'Card' },
  gpay:              { en: 'GPay',         hi: 'GPay' },
  phonepe:           { en: 'PhonePe',      hi: 'PhonePe' },
  paytm:             { en: 'Paytm',        hi: 'Paytm' },
  discount:          { en: 'Discount %',   hi: 'Chhoot %' },
  subtotal:          { en: 'Subtotal',     hi: 'Jod' },
  total:             { en: 'Total',        hi: 'Kul' },
  generateBill:      { en: 'Generate Bill', hi: 'Bill Banao' },
  billCreated:       { en: 'Bill Created!', hi: 'Bill ban gaya!' },
  printBill:         { en: 'Print Bill',   hi: 'Print karo' },
  newBill:           { en: 'New Bill',     hi: 'Naya Bill' },
  billSummary:       { en: 'Bill Summary', hi: 'Bill ka Hisaab' },
  commissionNote:    { en: 'Commission',   hi: 'Commission' },

  // ── Walk-in booking ──────────────────────────────────────────────────────
  bookAppointment:   { en: 'Book Appointment', hi: 'Appointment Lo' },
  walkInBooking:     { en: 'Walk-in Booking', hi: 'Walk-in Booking' },
  selectDate:        { en: 'Pick a date',  hi: 'Din chuniye' },
  selectTime:        { en: 'Pick a time slot', hi: 'Time chuniye' },
  today:             { en: 'Today',        hi: 'Aaj' },
  tomorrow:          { en: 'Tomorrow',     hi: 'Kal' },
  slotsAvailable:    { en: 'slots free',   hi: 'slot khali hain' },
  noSlots:           { en: 'No slots available', hi: 'Koi slot nahi hai' },
  loadingSlots:      { en: 'Checking slots…', hi: 'Slot dekh rahe hain…' },
  confirmBooking:    { en: 'Confirm Booking', hi: 'Booking Pakki karo' },
  bookingConfirmed:  { en: 'Booking Confirmed!', hi: 'Booking ho gayi!' },
  bookingNote:       { en: 'Customer will pay at salon', hi: 'Grahak salon mein paise denge' },
  duration:          { en: 'Duration',     hi: 'Kitna time' },
  dateAndTime:       { en: 'Date & Time',  hi: 'Din & Waqt' },
  appointmentNote:   { en: 'Booking saved — pay at salon', hi: 'Booking save ho gayi — salon mein payment' },

  // ── Staff Portal ─────────────────────────────────────────────────────────
  todaySchedule:     { en: "Today's Schedule", hi: 'Aaj ka Kaam' },
  noAppointments:    { en: 'No appointments today', hi: 'Aaj koi appointment nahi' },
  createBillNow:     { en: 'Create a Bill Now', hi: 'Abhi Bill Banao' },
  nextCustomer:      { en: 'Next Up',      hi: 'Agla Grahak' },
  makeBill:          { en: 'New Bill',     hi: 'Naya Bill' },
  makeAppointment:   { en: 'Book Appointment', hi: 'Appointment Lo' },
  earnings:          { en: 'Earnings',     hi: 'Kamaai' },
  myEarnings:        { en: 'My Earnings',  hi: 'Meri Kamaai' },
  todayEarnings:     { en: "Today's Commission", hi: "Aaj ki Kamaai" },
  thisWeek:          { en: 'This Week',    hi: 'Is Hafte' },
  thisMonth:         { en: 'This Month',   hi: 'Is Mahine' },
  commission:        { en: 'Commission',   hi: 'Commission' },
  salary:            { en: 'Monthly Salary', hi: 'Mahine ki Salary' },
  totalPayable:      { en: 'Total Payable', hi: 'Kul Milake' },
  commissionRate:    { en: 'Commission Rate', hi: 'Commission Rate' },
  serviceDone:       { en: 'services done', hi: 'kaam kiye' },
  noServiceToday:    { en: 'No services billed today yet', hi: 'Aaj abhi koi kaam nahi hua' },
  startBilling:      { en: 'Start billing to see commission!', hi: 'Bill banao to commission dikhega!' },
  profile:           { en: 'Profile',      hi: 'Profile' },
  home:              { en: 'Home',         hi: 'Home' },
  bill:              { en: 'Bill',         hi: 'Bill' },
  salonTag:          { en: 'Best Luxury Salon · Araria', hi: 'Araria ka sabse accha salon' },
  appointmentsToday: { en: 'Today\'s Appointments', hi: 'Aaj ke Appointment' },
  doneToday:         { en: 'Done Today',   hi: 'Aaj ke Kaam' },

  // ── Staff Portal — Appointments tab ──────────────────────────────────────
  appointments:      { en: 'Appointments', hi: 'Appointment' },
  upcoming:          { en: 'Upcoming',     hi: 'Aage ke' },
  noUpcoming:        { en: 'No upcoming appointments', hi: 'Aage koi appointment nahi' },
  assignedTo:        { en: 'Assigned to', hi: 'Kiska kaam' },
  unassigned:        { en: 'Unassigned', hi: 'Kisi ko nahi diya' },
  takeAppointment:   { en: 'Take this appointment', hi: 'Yeh kaam mujhe do' },
  me:                { en: 'Me', hi: 'Main' },
  call:              { en: 'Call', hi: 'Call' },
  called:            { en: 'Called', hi: 'Call kiya' },
  reschedule:        { en: 'Reschedule', hi: 'Time Badlo' },
  markDone:          { en: 'Mark Done', hi: 'Pura Ho Gaya' },
  pickNewSlot:       { en: 'Pick new date & time', hi: 'Naya time chuniye' },
  confirmReschedule: { en: 'Confirm New Time', hi: 'Naya Time Pakka Karo' },
  rescheduled:       { en: 'Rescheduled!', hi: 'Time badal gaya!' },
  cancel:            { en: 'Cancel', hi: 'Cancel' },
  unassign:          { en: 'Unassign', hi: 'Hata do' },
  noSlotsForDate:    { en: 'No slots available — try another date', hi: 'Koi slot nahi — doosra din try karo' },
  checkingSlots:     { en: 'Checking availability…', hi: 'Dekh rahe hain…' },
  pendingBookings:   { en: 'Pending Bookings', hi: 'Pending Booking' },
  pendingHint:       { en: 'Payment not done yet', hi: 'Abhi tak payment nahi hua' },
  pendingCallHint:   { en: 'Call to check if customer is facing a payment issue', hi: 'Customer ko call karke payment ka issue poochho' },
  confirmedTab:      { en: 'Confirmed', hi: 'Pakka' },
  pendingTab:        { en: 'Pending', hi: 'Pending' },
  notes:             { en: 'Notes', hi: 'Note' },
  addNote:           { en: 'Add Note', hi: 'Note Likho' },
  writeNote:         { en: 'Write a note for staff/admin…', hi: 'Staff/admin ke liye note likho…' },
  noNotes:           { en: 'No notes yet', hi: 'Abhi koi note nahi' },
  post:              { en: 'Post', hi: 'Bhejo' },
} as const;

export type TKey = keyof typeof T;
export default T;
