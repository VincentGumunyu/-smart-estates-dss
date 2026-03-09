import pandas as pd
import json
from datetime import datetime, date

def clean_df(df):
    # Basic cleaning
    df = df.fillna('')
    # Convert datetime/date objects to strings, handling NaT/NaN
    for col in df.columns:
        df[col] = df[col].apply(lambda x: x.strftime('%Y-%m-%d') if pd.notnull(x) and hasattr(x, 'strftime') else ('' if pd.isnull(x) else x))
    return df.to_dict(orient='records')

df1 = pd.read_excel('LIST OF LEGAL TUCKSHOPS GWERU CITY WIDE (1).xlsx')
df2 = pd.read_excel('Book2.xlsx')

data = {
    "tuckshops": clean_df(df1),
    "book2": clean_df(df2),
    "tuckshops_columns": df1.columns.tolist(),
    "book2_columns": df2.columns.tolist()
}

with open('data.json', 'w') as f:
    json.dump(data, f, indent=2)

print("Exported data.json")

