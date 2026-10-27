CREATE TABLE IF NOT EXISTS USER_ACCOUNT (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    email VARCHAR(100) UNIQUE,
    account_status VARCHAR(20) NOT NULL DEFAULT 'Active',
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    display_name VARCHAR(150),
    phone VARCHAR(30),

    CONSTRAINT chk_user_role
        CHECK (role IN ('Pet Owner', 'Veterinarian', 'Staff', 'Admin')),

    CONSTRAINT chk_account_status
        CHECK (account_status IN ('Active', 'Inactive'))
);


CREATE TABLE IF NOT EXISTS OWNER (
    owner_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT UNIQUE,
    name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    address TEXT,
    photo TEXT,
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,

    FOREIGN KEY (user_id)
        REFERENCES USER_ACCOUNT(user_id)
        ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS VETERINARIAN (
    veterinarian_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT UNIQUE,
    name VARCHAR(100) NOT NULL,
    specialization VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    license_number VARCHAR(50) UNIQUE,

    FOREIGN KEY (user_id)
        REFERENCES USER_ACCOUNT(user_id)
        ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS SERVICE (
    service_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    description TEXT
);


CREATE TABLE IF NOT EXISTS PET (
    pet_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    species VARCHAR(50) NOT NULL,
    breed VARCHAR(50),
    date_of_birth DATE,
    gender VARCHAR(10),
    allergies TEXT,
    notes TEXT,
    photo TEXT,

    FOREIGN KEY (owner_id)
        REFERENCES OWNER(owner_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_pet_gender
        CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Unknown')),

    CONSTRAINT chk_pet_birth_date
        CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE)
);


CREATE TABLE IF NOT EXISTS APPOINTMENT (
    appointment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pet_id INT NOT NULL,
    veterinarian_id INT,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancellation_reason TEXT,
    rescheduled_from_date DATE,
    rescheduled_from_time TIME,
    reschedule_reason TEXT,

    FOREIGN KEY (pet_id)
        REFERENCES PET(pet_id)
        ON DELETE RESTRICT,

    FOREIGN KEY (veterinarian_id)
        REFERENCES VETERINARIAN(veterinarian_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_appointment_status
        CHECK (status IN (
            'Pending',
            'Scheduled',
            'Approved',
            'Checked-in',
            'In Progress',
            'Completed',
            'Cancelled',
            'No-show'
        ))
);


CREATE TABLE IF NOT EXISTS APPOINTMENT_SERVICE (
    appointment_id INT NOT NULL,
    service_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),

    PRIMARY KEY (appointment_id, service_id),

    FOREIGN KEY (appointment_id)
        REFERENCES APPOINTMENT(appointment_id)
        ON DELETE CASCADE,

    FOREIGN KEY (service_id)
        REFERENCES SERVICE(service_id)
        ON DELETE RESTRICT
);


CREATE TABLE IF NOT EXISTS MEDICAL_RECORD (
    record_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id INT NOT NULL UNIQUE,
    diagnosis TEXT NOT NULL,
    treatment TEXT,
    notes TEXT,
    record_date DATE NOT NULL DEFAULT CURRENT_DATE,
    services JSONB NOT NULL DEFAULT '[]'::JSONB,

    FOREIGN KEY (appointment_id)
        REFERENCES APPOINTMENT(appointment_id)
        ON DELETE RESTRICT
);


CREATE TABLE IF NOT EXISTS PRESCRIPTION (
    prescription_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_id INT NOT NULL,
    medication_name VARCHAR(100) NOT NULL,
    dosage VARCHAR(50) NOT NULL,
    instructions TEXT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    date_prescribed DATE NOT NULL DEFAULT CURRENT_DATE,

    FOREIGN KEY (record_id)
        REFERENCES MEDICAL_RECORD(record_id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS VACCINATION (
    vaccination_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pet_id INT NOT NULL,
    veterinarian_id INT,
    vaccine_type VARCHAR(100) NOT NULL,
    date_administered DATE NOT NULL,
    next_due_date DATE,
    notes TEXT,
    administered_by VARCHAR(150),
    appointment_id INT,
    last_reminded_at TIMESTAMP,

    FOREIGN KEY (pet_id)
        REFERENCES PET(pet_id)
        ON DELETE RESTRICT,

    FOREIGN KEY (veterinarian_id)
        REFERENCES VETERINARIAN(veterinarian_id)
        ON DELETE RESTRICT,

    FOREIGN KEY (appointment_id)
        REFERENCES APPOINTMENT(appointment_id)
        ON DELETE SET NULL,

    CONSTRAINT chk_vaccination_dates
        CHECK (
            next_due_date IS NULL
            OR next_due_date >= date_administered
        )
);


CREATE TABLE IF NOT EXISTS AUDIT_LOG (
    audit_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT,
    action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id INT,
    action_description TEXT,
    action_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES USER_ACCOUNT(user_id)
        ON DELETE SET NULL,

    CONSTRAINT chk_audit_action_type
        CHECK (action_type IN (
            'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'
        ))
);


CREATE TABLE IF NOT EXISTS NOTIFICATION (
    notification_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL,
    notification_type VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES USER_ACCOUNT(user_id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS AUTH_SESSION (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    role VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES USER_ACCOUNT(user_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_auth_session_expiry
        CHECK (expires_at > created_at)
);
