const mondayAccessToken = process.env.MONDAY_ACCESS_TOKEN;  
const geotabDatabase = process.env.GEOTAB_DATABASE;
const geotabUsername = process.env.GEOTAB_USERNAME;
const geotabPassword = process.env.GEOTAB_PASSWORD;

async function fetchMondayGroups() {
    console.log("Fetching Monday.com groups...");
    const query = `query {
        boards(ids: 654431444) {
            groups {
                title
                id
            }
        }
    }`;

    const request = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mondayAccessToken}`,
        },
        body: JSON.stringify({ query })
    };

    const response = await fetch("https://api.monday.com/v2", request);

    const responseData = await response.json();
    console.log("Response from Monday.com API:", responseData);

    const { data } = responseData;
    if (data && data.boards && Array.isArray(data.boards) && data.boards.length > 0) {
        return data.boards[0].groups;
    } else {
        console.error("Error: Unable to fetch Monday.com groups. Response:", responseData);
        return [];
    }
}

async function fetchGeotabDevices() {
    try {
        console.log("Fetching Geotab devices...");
        const response = await fetch(`https://my.geotab.com/apiv1/your-endpoint`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                database: geotabDatabase,
                username: geotabUsername,
                password: geotabPassword
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching Geotab devices:", error);
        throw error;
    }
}

async function fetchDevicesAndUpdateOdometer(namesToFind) {
    try {
        const results = [];
        const devices = await fetchGeotabDevices();
        const now = new Date().toISOString();
        const diagnostic = {
            id: "DiagnosticOdometerAdjustmentId"
        };

        devices.forEach(function (device) {
            const parts = device.name.split(/\s*-\s*/);
            const deviceIdentifier = parts[0];

            if (namesToFind.includes(deviceIdentifier)) {
                results.push({
                    name: device.name,
                    vehicleIdentificationNumber: device.vehicleIdentificationNumber,
                    odometer: Math.random() * 100000 // Simulate odometer value, replace with actual API result
                });
            }
        });

        return results.filter(result => result.odometer !== undefined);
    } catch (error) {
        console.error("Error updating odometer:", error);
        throw error;
    }
}

async function updateMondayOdometerReadings() {
    try {
        const groups = await fetchMondayGroups();
        console.log(`Fetched ${groups.length} groups from Monday.com.`);

        const namesAndItemIds = {
            "155537": "1300352351",
            "155796": "1300342845",
            "155797": "1300341186",
            "162246": "1300345210",
            "162247": "1300349450"
        };

        const devicesWithOdometer = await fetchDevicesAndUpdateOdometer(Object.keys(namesAndItemIds));

        for (const [name, item_id] of Object.entries(namesAndItemIds)) {
            const device = devicesWithOdometer.find(device => device.name.startsWith(name));
            if (device) {
                console.log(`Updating Monday.com for device ${name} with item ID: ${item_id}...`);
                const mutationQuery = `
                    mutation {
                        change_column_value (
                            board_id: 654431444,
                            item_id: "${item_id}",
                            column_id: "miles12",
                            value: "{\\"text\\":\\"${device.odometer}\\"}"
                        ) {
                            id
                        }
                    }
                `;
                const response = await fetch("https://api.monday.com/v2", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${mondayAccessToken}`,
                    },
                    body: JSON.stringify({ query: mutationQuery })
                });
                const data = await response.json();
                console.log("Monday.com update response:", data);
            } else {
                console.log(`No matching device found for ${name}.`);
            }
        }
    } catch (error) {
        console.error('Error updating Monday.com:', error);
    }
}

updateMondayOdometerReadings();
