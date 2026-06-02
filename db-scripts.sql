CREATE TABLE
    `freight_tracking_app`.`purchase_order` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `po_number` VARCHAR(45) NULL,
        `po_quantity` INT NULL,
        `ex_factory_date` VARCHAR(45) NULL,
        `shipping_mode` VARCHAR(45) NULL,
        `final_destination` VARCHAR(45) NULL,
        `supplier_id` INT NOT NULL,
        `freight_forwarder` INT NOT NULL,
        `payment_mode` VARCHAR(45) NULL,
        `instructions` VARCHAR(45) NULL,
        `actual_delivery_date` DATETIME NULL,
        `PO_url` VARCHAR(45) NULL,
        `status` VARCHAR(45) NULL,
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
        `unit_cost` DECIMAL(10,2) NULL,
        `quantity` INT NULL,
        `cartoons` INT NULL,
        `gross_weight` VARCHAR(45) NULL,
        `net_weight` VARCHAR(45) NULL,
        `ctn_demi` VARCHAR(45) NULL,
        `cbm` VARCHAR(45) NULL,
        `dispatched_quantity` INT NULL,
        `status` VARCHAR(45) NULL,
        `packing_list_id` INT NULL,
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
        `client_id` INT NULL,
        `date` DATETIME NULL,
        `gdn_id` INT NULL,
        PRIMARY KEY (`id`),
        UNIQUE INDEX `id_UNIQUE` (`id` ASC) VISIBLE
    );

CREATE TABLE
    `freight_tracking_app`.`hbl_hawb_tbl` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `client_id` INT NULL,
        `manufacture_id` INT NULL,
        `date` DATETIME NULL,
        `type` VARCHAR(45) NULL,
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
        `id` INT NOT NULL,
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