const mondayAccessToken = process.env.MONDAY_ACCESS_TOKEN;  
const geotabDatabase = process.env.GEOTAB_DATABASE;
const geotabUsername = process.env.GEOTAB_USERNAME;
const geotabPassword = process.env.GEOTAB_PASSWORD;
const geotabPath = process.env.GEOTAB_PATH;

import GeotabApi from 'mg-api-js';

// Initialize Geotab API with credentials
const api = new GeotabApi({
    credentials: {
        database: geotabDatabase,
        userName: geotabUsername,
        password: geotabPassword
    },
    path: geotabPath || 'my.geotab.com'  
});

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

    if (responseData.data?.boards?.length > 0) {
        return responseData.data.boards[0].groups;
    } else {
        console.error("Unable to fetch Monday.com groups. Response:", responseData);
        return [];
    }
}

async function fetchDevicesAndUpdateOdometer(namesToFind) {
    try {
        const results = [];
        const group = { id: "GroupAssetInformationId" };
        const devices = await api.call('Get', {
            typeName: 'Device',
            search: { groups: [group] },
            resultsLimit: 200
        });
        const now = new Date().toISOString();
        const calls = [];
        const diagnostic = { id: "DiagnosticOdometerAdjustmentId" };

        devices.forEach(function (device) {
            const deviceIdentifier = device.name.split(/\s*-\s*/)[0];
            if (namesToFind.includes(deviceIdentifier)) {
                results.push({
                    name: device.name,
                    vehicleIdentificationNumber: device.vehicleIdentificationNumber
                });
                calls.push({
                    method: "Get",
                    params: {
                        typeName: "StatusData",
                        search: {
                            fromDate: now,
                            toDate: now,
                            diagnosticSearch: diagnostic,
                            deviceSearch: { id: device.id }
                        }
                    }
                });
            }
        });

        const callResults = await api.call("ExecuteMultiCall", { calls: calls });
        callResults.forEach((callResult, i) => {
            const statusData = callResult[0];
            if (statusData) {
                const kilometers = statusData.data;
                const miles = (kilometers * 0.621371).toFixed(6);
                results[i].odometer = miles;
            }
        });

        return results.filter(result => result.odometer !== undefined);
    } catch (error) {
        console.error('Error fetching devices:', error);
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
            "162247": "1300349450",
            "162248": "1300348007",
            "164003": "1300356754",
            "164004": "1300357909",
            "164013": "1300354107",
            "164014": "1388749808",
            "292470": "4155597387",
            "292471": "3335426976",
            "292472": "4155600952",
            "292498": "2999228918"
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

export { updateMondayOdometerReadings };
