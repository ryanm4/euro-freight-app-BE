CREATE TABLE
    `freight_tracking_app`.`purchase_order` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `po_number` VARCHAR(45) NULL,
        `po_quantity` INT NULL,
        `completed_qty` INT NULL,
        `ex_factory_date` VARCHAR(45) NULL,
        `shipping_mode` VARCHAR(45) NULL,
        `final_destination` VARCHAR(45) NULL,
        `supplier_id` INT NOT NULL,
        `freight_forwarder` INT NOT NULL,
        `payment_mode` VARCHAR(45) NULL,
        `instructions` VARCHAR(45) NULL,
        `cargo_dispatch_date` DATETIME NULL,
        `PO_url` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
        `packing_list_id` INT NULL,
        `hbl_no` VARCHAR(45) NULL,
        `dc_inhouse_date` DATETIME NULL,
        `eta_dest` VARCHAR(45) NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`),
        UNIQUE INDEX `id_UNIQUE` (`id` ASC) VISIBLE
    );

CREATE TABLE
    `freight_tracking_app`.`po_details` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `po_id` INT NOT NULL,
        `sku` VARCHAR(45) NULL,
        `item_name` VARCHAR(45) NULL,
        `color` VARCHAR(45) NULL,
        `size` VARCHAR(45) NULL,
        `country_of_origin` VARCHAR(45) NULL,
        `unit_cost` DECIMAL(10, 2) NULL,
        `quantity` INT NULL,
        `cartoons` INT NULL,
        `gross_weight` VARCHAR(45) NULL,
        `net_weight` VARCHAR(45) NULL,
        `ctn_demi` VARCHAR(45) NULL,
        `cbm` VARCHAR(45) NULL,
        `dispatched_quantity` INT NULL,
        `status` VARCHAR(45) NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`)
    );

CREATE TABLE
    `freight_tracking_app`.`clients` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `name` VARCHAR(45) NOT NULL,
        `address` VARCHAR(45) NULL,
        `contact_no` VARCHAR(45) NULL,
        `contact_person` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
        `type` VARCHAR(45) NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`),
        UNIQUE INDEX `id_UNIQUE` (`id` ASC) VISIBLE
    );

CREATE TABLE
    `freight_tracking_app`.`packing_list` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `packing_list_no` VARCHAR(45) NULL,
        `client_id` INT NULL,
        `manufacturer_id` VARCHAR(45) NULL,
        `date` DATETIME NULL,
        `gdn_id` INT NULL,
        `grn_id` INT NULL,
        `total_quantity` INT NULL,
        `ship_to` VARCHAR(45) NULL,
        `document_date` DATE NULL,
        `total_cartons` INT NULL,
        `total_gross_weight_kg` DECIMAL(10, 3) NULL,
        `total_net_weight_kg` DECIMAL(10, 3) NULL,
        `total_cbm` DECIMAL(10, 3) NULL,
        `total_volume` DECIMAL(10, 3) NULL,
        `shipping_mode` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`),
        UNIQUE INDEX `id_UNIQUE` (`id` ASC) VISIBLE
    );

CREATE TABLE
    IF NOT EXISTS packing_list_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        po_number VARCHAR(20) NOT NULL,
        sku VARCHAR(30) NOT NULL,
        item_description VARCHAR(255) NOT NULL, -- item name + color combined
        size VARCHAR(10) NOT NULL,
        unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
        quantity INT NOT NULL,
        ctn_count INT NOT NULL DEFAULT 1,
        gross_weight_kg DECIMAL(10, 3) NOT NULL,
        net_weight_kg DECIMAL(10, 3) NOT NULL,
        carton_dimensions VARCHAR(50),
        cbm DECIMAL(10, 4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_shipment FOREIGN KEY (shipment_id) REFERENCES packing_list_shipments (id) ON DELETE CASCADE,
        INDEX idx_po_number (po_number),
        INDEX idx_sku (sku)
    );

CREATE TABLE
    `freight_tracking_app`.`hbl_hawb_tbl` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `client_id` INT NULL,
        `manufacture_id` INT NULL,
        `date` DATETIME NULL,
        `type` VARCHAR(45) NULL,
        `house_bl_no` VARCHAR(45) NULL,
        `shipment_id` INT NULL,
        `planned_vessel_name` VARCHAR(45) NULL,
        `voyage_no` VARCHAR(45) NULL,
        `etd` DATETIME NULL,
        `eta` DATETIME NULL,
        `actual_etd` DATETIME NULL,
        `actual_eta` DATETIME NULL,
        `arrival_port` VARCHAR(45) NULL,
        `inland_location` VARCHAR(45) NULL,
        `mbl_mawb_no` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
        `no_pieces` INT NULL,
        `gross_weight` VARCHAR(45) NULL,
        `chargeable_weight` VARCHAR(45) NULL,
        `cbm` VARCHAR(45) NULL,
        `container_seal_no` VARCHAR(45) NULL,
        `onboard_date` DATETIME NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`)
    );

CREATE TABLE
    `freight_tracking_app`.`multi_ports` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `hbl_hawb_id` INT NOT NULL,
        `port` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`)
    );

CREATE TABLE
    `freight_tracking_app`.`shipments` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `vessel_name` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`)
    );

CREATE TABLE
    `freight_tracking_app`.`goods_deliver_notes` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `client_id` INT NULL,
        `manufacture_id` INT NULL,
        `forwarder_id` INT NULL,
        `date` DATETIME NULL,
        `cartoons` VARCHAR(45) NULL,
        `actual_cartoons` VARCHAR(45) NULL,
        `gross_weight` VARCHAR(45) NULL,
        `actual_gross_weight` VARCHAR(45) NULL,
        `gross_volume` VARCHAR(45) NULL,
        `actual_gross_volume` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
        `gdn_grn_ref` VARCHAR(45) NULL,
        `vehicle_no` VARCHAR(45) NULL,
        `driver_id` INT NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        `dispatch_location` VARCHAR(45) NULL  ,
        `transport_mode` VARCHAR(45) NULL  ,
        `container_no` VARCHAR(45) NULL  ,
        `container_size` VARCHAR(45) NULL,
        `primary_seal_no` VARCHAR(45) NULL  ,
        `secondary_seal_no` VARCHAR(45) NULL ,
        `custom_doc_status` VARCHAR(45) NULL  ,
        `wharf_staff_id` VARCHAR(45) NULL ;
        PRIMARY KEY (`id`)
    );

CREATE TABLE
    `freight_tracking_app`.`goods_receive_notes` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `client_id` INT NULL,
        `manufacture_id` INT NULL,
        `forwarder_id` INT NULL,
        `date` DATETIME NULL,
        `quantity` INT NULL,
        `bill_id` INT NULL,
        `status` VARCHAR(45) NULL,
        `comments` TEXT NULL,
        `created_by` VARCHAR(45) NULL,
        `created_on` DATETIME NULL,
        `updated_by` VARCHAR(45) NULL,
        `updated_on` DATETIME NULL,
        PRIMARY KEY (`id`)
    );

CREATE TABLE
    `freight_tracking_app`.`users` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(150),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

CREATE TABLE
    `freight_tracking_app`.roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_name VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE
    `freight_tracking_app`.user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_role (user_id, role_id)
    );

CREATE TABLE
    `freight_tracking_app`.groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_name VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE
    `freight_tracking_app`.user_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        group_id INT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES `freight_tracking_app`.groups (id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_group (user_id, group_id)
    );

CREATE TABLE
    `freight_tracking_app`.group_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        role_id INT NOT NULL,
        FOREIGN KEY (group_id) REFERENCES `freight_tracking_app`.groups (id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
        UNIQUE KEY unique_group_role (group_id, role_id)
    );

CREATE TABLE
    `freight_tracking_app`.`shipping_quantity` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `po_id` INT NOT NULL,
        `quantity` INT NULL,
        `type` VARCHAR(45) NULL,
        PRIMARY KEY (`id`),
        INDEX `po_id_idx` (`po_id` ASC) VISIBLE,
        CONSTRAINT `po_id` FOREIGN KEY (`po_id`) REFERENCES `freight_tracking_app`.`purchase_order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
    );

CREATE TABLE
    `freight_tracking_app`.`drivers` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `name` VARCHAR(45) NULL,
        `nic_no` VARCHAR(45) NULL,
        `manufacturer_id` INT NOT NULL,
        `contact_no` VARCHAR(45) NULL,
        PRIMARY KEY (`id`),
        INDEX `manufacturer_id_idx` (`manufacturer_id` ASC) VISIBLE,
        CONSTRAINT `manufacturer_id` FOREIGN KEY (`manufacturer_id`) REFERENCES `freight_tracking_app`.`clients` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
    );

CREATE TABLE
    `freight_tracking_app`.`wharf_staff` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `name` VARCHAR(45) NULL,
        `contact_no` VARCHAR(45) NULL,
        PRIMARY KEY (`id`)
    );