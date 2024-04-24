const express = require('express')
const fs = require('fs')
const cors = require('cors')
const admin = require('firebase-admin')

const serviceAccount = require('./react-lib-67ba0-firebase-adminsdk-23ims-01ccf566a8.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    'https://react-lib-67ba0-default-rtdb.europe-west1.firebasedatabase.app',
})

const db = admin.database()

const app = express()
const port = 4000

app.use(cors({ origin: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/', (req, res) => {
  res.status(200).send('Hello, World!')
})

app.get('/import-data', async (req, res) => {
  try {
    const employees = parseFile('./dump.txt') // Specify the correct path to your dump file
    await uploadData(employees)
    res.send('Data imported successfully!')
  } catch (error) {
    console.error('Failed to import data:', error)
    res.status(500).send('Error importing data')
  }
})

app.get('/employees/:id', async (req, res) => {
  const employeeId = req.params.id
  const employeeRef = db.ref(`employees/${employeeId}`)

  try {
    employeeRef.once('value', (snapshot) => {
      if (snapshot.exists()) {
        const employeeData = snapshot.val()

        if (
          employeeData.statements &&
          typeof employeeData.statements === 'object'
        ) {
          employeeData.statements = Object.keys(employeeData.statements).map(
            (key) => employeeData.statements[key]
          )
        }

        res.json(employeeData)
      } else {
        res.status(404).send('Employee not found')
      }
    })
  } catch (err) {
    console.error('Error fetching employee', err)
    res.status(500).send('Internal Server Error')
  }
})

app.get('/calculate-rewards', async (req, res) => {
  try {
    const employeesRef = db.ref('employees')
    const snapshot = await employeesRef.once('value')
    const employees = snapshot.val()
    if (!employees) {
      return res.status(404).send('No employee data found.')
    }

    let totalQualifyingAmount = 0
    let employeeContributions = {}

    // Calculate the total qualifying amount and store individual qualifying amounts
    for (let employeeKey in employees) {
      const employee = employees[employeeKey]
      if (employee.statements && Array.isArray(employee.statements)) {
        let employeeTotal = employee.statements.reduce((sum, statement) => {
          return sum + statement.amount
        }, 0)

        if (employeeTotal > 100) {
          totalQualifyingAmount += employeeTotal
          employeeContributions[employeeKey] = employeeTotal
        }
      }
    }

    // Calculate the reward for each qualifying employee
    const rewards = Object.keys(employeeContributions).map((employeeKey) => {
      const percentage =
        employeeContributions[employeeKey] / totalQualifyingAmount
      return {
        employeeId: employeeKey,
        reward: percentage * 10000,
      }
    })

    res.json(rewards)
  } catch (error) {
    console.error('Failed to calculate rewards:', error)
    res.status(500).send('Failed to calculate rewards')
  }
})

function parseFile(filePath) {
  const data = fs.readFileSync(filePath, 'utf8')
  const lines = data.split('\n')

  const employees = []
  let currentEmployee = null
  let currentDepartment = null
  let currentStatement = null

  lines.forEach((line) => {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('Employee')) {
      if (currentEmployee) {
        employees.push(currentEmployee) // Save previous employee if exists
      }
      currentEmployee = { statements: [], department: {} }
    } else if (
      trimmedLine.startsWith('id:') &&
      !currentDepartment &&
      !currentStatement
    ) {
      currentEmployee.id = trimmedLine.split('id: ')[1]
    } else if (
      trimmedLine.startsWith('name:') &&
      !currentDepartment &&
      !currentStatement
    ) {
      currentEmployee.name = trimmedLine.split('name: ')[1]
    } else if (trimmedLine.startsWith('Department')) {
      currentDepartment = {}
      currentEmployee.department = currentDepartment
    } else if (trimmedLine.startsWith('id:') && currentDepartment) {
      currentDepartment.id = trimmedLine.split('id: ')[1]
    } else if (trimmedLine.startsWith('name:') && currentDepartment) {
      currentDepartment.name = trimmedLine.split('name: ')[1]
    } else if (trimmedLine.startsWith('Statement')) {
      currentStatement = {}
      currentEmployee.statements.push(currentStatement)
    } else if (trimmedLine.startsWith('id:') && currentStatement) {
      currentStatement.id = trimmedLine.split('id: ')[1]
    } else if (trimmedLine.startsWith('amount:')) {
      currentStatement.amount = parseFloat(trimmedLine.split('amount: ')[1])
    } else if (trimmedLine.startsWith('date:')) {
      currentStatement.date = trimmedLine.split('date: ')[1]
    }
  })

  if (currentEmployee) {
    // Don't forget to push the last employee
    employees.push(currentEmployee)
  }

  return employees
}

async function uploadData(data) {
  const ref = db.ref('employees')
  for (const employee of data) {
    await ref.push(employee)
  }
}

app.listen(port, () => {
  console.log(`Running a server at http://localhost:${port}`)
})
