# Morwane & Fatima — Wedding Admin MVP

This folder contains the first non-production prototype of the couple's private wedding-management dashboard.

## Current prototype
- Dashboard overview
- Guests & RSVP table
- Wedding budget
- Vendors
- Tasks
- May 25–26 programme
- Responsive mobile layout

All guest names and dashboard figures shown in the prototype are demonstration data only.

## Security rule
The GitHub repository is public, therefore real guest data, passwords, API secrets, private documents and authentication credentials must never be committed here.

## Production architecture
The guest-facing V8 site stays public and unchanged. The private admin interface should connect to a protected backend for:
- two authenticated couple accounts (Fatima and Morwane)
- guest and RSVP records
- budget and payment records
- vendors
- tasks
- programme items
- later: documents, accommodation, transport and table planning

Recommended backend shape: hosted authentication + relational database with row-level access restricted to the two authorised accounts. Secrets must be stored outside the public repository.

## Data model (MVP)
### guests
id, household_id, first_name, last_name, email, phone, language, guest_type, rsvp_status, adults_count, children_count, plus_one, allergies, meal_preference, alcohol, accommodation_need, transport_need, passport_visa, notes

### households
id, label, side, invitation_status, save_the_date_status, reminder_status

### budget_items
id, category, vendor_id, planned_mad, quoted_mad, paid_mad, balance_mad, due_date, status, notes

### vendors
id, category, name, contact_name, phone, email, quote_status, contract_status, deposit_paid, balance_due, notes

### tasks
id, title, description, owner, priority, status, due_date, linked_vendor_id

### programme_items
id, wedding_day, start_time, end_time, title, description, owner, status

## Next implementation step
Connect authentication and persistent database storage, then replace all demonstration figures with live aggregates from the secured data tables.