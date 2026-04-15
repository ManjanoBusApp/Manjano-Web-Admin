export default function App() {
  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white p-4">
        <h1 className="text-xl font-bold mb-6">Manjano Admin</h1>

        <nav className="space-y-3">
          <div className="hover:bg-gray-700 p-2 rounded cursor-pointer">
            Dashboard
          </div>

          <div className="hover:bg-gray-700 p-2 rounded cursor-pointer">
            Schools
          </div>

          <div className="hover:bg-gray-700 p-2 rounded cursor-pointer">
            Students
          </div>

          <div className="hover:bg-gray-700 p-2 rounded cursor-pointer">
            Drivers
          </div>

          <div className="hover:bg-gray-700 p-2 rounded cursor-pointer">
            Parents
          </div>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 bg-gray-100 p-6">
        <h2 className="text-2xl font-semibold mb-4">
          Dashboard Overview
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded shadow">
            <p className="text-gray-500">Schools</p>
            <p className="text-2xl font-bold">0</p>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <p className="text-gray-500">Students</p>
            <p className="text-2xl font-bold">0</p>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <p className="text-gray-500">Drivers</p>
            <p className="text-2xl font-bold">0</p>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <p className="text-gray-500">Parents</p>
            <p className="text-2xl font-bold">0</p>
          </div>
        </div>
      </div>
    </div>
  );
}