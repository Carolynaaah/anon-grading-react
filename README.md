# Anonymous Grading Web Application (React)

## Authors
- Gruiescu Ana-Bianca  
- Lăzăroiu Teodora-Maria

---

## Project Description

This project is a **Single Page Application (SPA)** that enables **anonymous peer grading of student projects**.  
Students can submit projects and partial deliverables, while anonymous juries of colleagues evaluate them.  
Professors can view final evaluation results without being able to see the identity of jury members.

The application is implemented using **React** and runs entirely on **localhost**, using browser `localStorage` for data persistence (academic/demo purpose).

---

## Assignment Requirements Coverage

The following table explains how the project satisfies the given assignment requirements.

### 1. Anonymous peer grading
- Projects are evaluated by **randomly assigned juries**
- Jury members cannot see other evaluators
- Professors cannot see jury identities

### 2. Single Page Application
- The application is implemented as a **SPA**
- No page reloads are required
- UI updates dynamically based on application state

### 3. Student project and deliverable management
- Students (PM role) can:
  - create projects
  - define team members
  - add partial deliverables
- Each deliverable has:
  - due date
  - jury size
  - grade edit window

### 4. Jury assignment
- Jury members are **automatically and randomly selected**
- Assignment happens when a deliverable becomes due
- Only students not part of the project team are eligible
- Jury assignment updates dynamically if new students register before due time

### 5. Anonymous grading
- Grades are submitted anonymously
- Only jury members can submit or modify their own grades
- Grades can only be edited during a limited time window

### 6. Grade calculation
- Grades range from **1 to 10**
- Maximum **2 decimal places**
- Final grade is calculated by:
  - removing the lowest grade
  - removing the highest grade
  - averaging the remaining grades

### 7. Professor access
- Professors can view:
  - all projects
  - all deliverables
  - submitted grades
  - final computed grades
- Jury identities are never revealed

### 8. Permissions system
- Role-based access control:
  - students manage projects and grades
  - professors only view results
- PM team members cannot grade their own project
- Users can only edit their own grades

---

## Main Features

### Student
- Register and log in as a student
- Create projects and define team members (PM role)
- Add partial project deliverables
- Upload demonstrative video or deployed project links
- Grade assigned deliverables anonymously

### Professor
- View evaluation results per project
- Access final grades without jury identities

---

## Technologies Used

- React
- Vite
- JavaScript (ES6+)
- HTML5
- CSS3
- Browser LocalStorage (for persistence)

---

## Project Structure

```
anon-grading-react/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── public/
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## How to Run the Project Locally

### Requirements
- Node.js (v18 or newer recommended)
- npm

### Steps

1. Install dependencies:
```
npm install
```

2. Start the development server:
```
npm run dev
```

3. Open in browser:
```
http://localhost:5173/
```

---

## Notes

- This project does **not use a backend server**
- Authentication is simplified (no passwords), as credentials are not required by the assignment
- All data is stored locally in the browser using `localStorage`
- The focus is on **SPA architecture, permissions, anonymity, and grading logic**

---

## Academic Purpose

This application was developed as part of a **Web Technologies** academic project and demonstrates:
- SPA design principles
- client-side state management
- role-based permissions
- anonymous peer evaluation
- React fundamentals
